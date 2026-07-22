import type {
  GmailAttachmentSummary,
  GmailInboxData,
  GmailMessageDetail,
  GmailMessageSummary,
  GmailSendRequest,
} from "@/types/gmail";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";
const INBOX_PAGE_SIZE = 20;

type GmailMessageReference = {
  id?: string;
  threadId?: string;
};

type GmailListResponse = {
  messages?: GmailMessageReference[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

type GmailProfileResponse = {
  emailAddress?: string;
  messagesTotal?: number;
  threadsTotal?: number;
};

type GmailHeader = {
  name?: string;
  value?: string;
};

type GmailMessagePart = {
  filename?: string;
  mimeType?: string;
  body?: {
    attachmentId?: string;
    data?: string;
    size?: number;
  };
  parts?: GmailMessagePart[];
};

type GmailRawMessageResponse = {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailMessagePart & {
    headers?: GmailHeader[];
  };
};

type GmailSendApiResponse = {
  id?: string;
  threadId?: string;
};

export class GmailApiError extends Error {
  constructor(public readonly status: number) {
    super(`Gmail API error (${status})`);
    this.name = "GmailApiError";
  }
}

async function gmailRequest<T>(
  url: URL,
  accessToken: string,
  options?: { method: "POST"; body: unknown },
): Promise<T> {
  const response = await fetch(url, {
    method: options?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(options ? { "Content-Type": "application/json" } : {}),
    },
    body: options ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new GmailApiError(response.status);
  }

  return (await response.json()) as T;
}

function headerValue(headers: GmailHeader[] | undefined, name: string) {
  return (
    headers?.find(
      (header) => header.name?.toLocaleLowerCase("en-US") === name,
    )?.value?.trim() ?? ""
  );
}

function parseSender(fromHeader: string) {
  const bracketMatch = fromHeader.match(/^(.*)<([^>]+)>$/);

  if (!bracketMatch) {
    return {
      senderName: fromHeader || "Expéditeur inconnu",
      senderEmail: fromHeader,
    };
  }

  const senderName = bracketMatch[1].trim().replace(/^"|"$/g, "");
  const senderEmail = bracketMatch[2].trim();

  return {
    senderName: senderName || senderEmail,
    senderEmail,
  };
}

function normalizeMessage(
  message: GmailRawMessageResponse,
): GmailMessageSummary {
  const headers = message.payload?.headers;
  const fromHeader = headerValue(headers, "from");
  const labels = new Set(message.labelIds ?? []);
  const { senderName, senderEmail } = parseSender(fromHeader);
  const parsedDate = Number(message.internalDate);

  return {
    id: message.id ?? "",
    threadId: message.threadId ?? "",
    senderName,
    senderEmail,
    recipients: headerValue(headers, "to"),
    subject: headerValue(headers, "subject") || "(Sans objet)",
    snippet: message.snippet?.trim() || "Aucun aperçu disponible.",
    receivedAt: Number.isFinite(parsedDate) ? parsedDate : Date.now(),
    isUnread: labels.has("UNREAD"),
    isStarred: labels.has("STARRED"),
    isImportant: labels.has("IMPORTANT"),
  };
}

async function getMessageMetadata(id: string, accessToken: string) {
  const url = new URL(`${GMAIL_API_BASE}/users/me/messages/${id}`);
  url.searchParams.set("format", "metadata");

  for (const header of ["From", "To", "Subject", "Date"]) {
    url.searchParams.append("metadataHeaders", header);
  }

  return gmailRequest<GmailRawMessageResponse>(url, accessToken);
}

/**
 * Charge une page de la boîte de réception. Gmail renvoie d'abord des
 * identifiants, puis un appel `messages.get` fournit les métadonnées.
 */
export async function listGmailInboxPage(
  accessToken: string,
  pageToken?: string,
): Promise<GmailInboxData> {
  const listUrl = new URL(`${GMAIL_API_BASE}/users/me/messages`);
  listUrl.searchParams.set("maxResults", String(INBOX_PAGE_SIZE));
  listUrl.searchParams.set("labelIds", "INBOX");
  listUrl.searchParams.set("includeSpamTrash", "false");
  if (pageToken) {
    listUrl.searchParams.set("pageToken", pageToken);
  }

  const profileUrl = new URL(`${GMAIL_API_BASE}/users/me/profile`);
  const [list, profile] = await Promise.all([
    gmailRequest<GmailListResponse>(listUrl, accessToken),
    gmailRequest<GmailProfileResponse>(profileUrl, accessToken),
  ]);

  const messageIds = (list.messages ?? [])
    .map((message) => message.id)
    .filter((id): id is string => Boolean(id));

  // Deux petits lots évitent d'ouvrir trop de connexions en parallèle.
  const messages: GmailMessageSummary[] = [];
  for (let index = 0; index < messageIds.length; index += 10) {
    const batch = messageIds.slice(index, index + 10);
    const metadata = await Promise.all(
      batch.map((id) => getMessageMetadata(id, accessToken)),
    );
    messages.push(
      ...metadata.map(normalizeMessage).filter((message) => message.id),
    );
  }

  return {
    accountEmail: profile.emailAddress ?? "",
    mailboxMessageCount: profile.messagesTotal ?? 0,
    mailboxThreadCount: profile.threadsTotal ?? 0,
    inboxEstimate: list.resultSizeEstimate ?? messages.length,
    hasMore: Boolean(list.nextPageToken),
    nextPageToken: list.nextPageToken,
    messages,
    syncedAt: new Date().toISOString(),
  };
}

function decodeBase64Url(data: string) {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function findBodyPart(
  part: GmailMessagePart | undefined,
  mimeType: "text/plain" | "text/html",
): GmailMessagePart | undefined {
  if (part?.mimeType === mimeType && !part.filename && part.body?.data) {
    return part;
  }

  for (const child of part?.parts ?? []) {
    const match = findBodyPart(child, mimeType);
    if (match) {
      return match;
    }
  }

  return undefined;
}

function htmlToPlainText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractBodyText(payload: GmailMessagePart | undefined) {
  const plainPart = findBodyPart(payload, "text/plain");
  if (plainPart?.body?.data) {
    return decodeBase64Url(plainPart.body.data).trim();
  }

  const htmlPart = findBodyPart(payload, "text/html");
  if (htmlPart?.body?.data) {
    return htmlToPlainText(decodeBase64Url(htmlPart.body.data));
  }

  if (payload?.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    return payload.mimeType === "text/html"
      ? htmlToPlainText(decoded)
      : decoded.trim();
  }

  return "Le contenu de ce message n'est pas disponible en texte.";
}

function collectAttachments(
  part: GmailMessagePart | undefined,
  attachments: GmailAttachmentSummary[] = [],
) {
  if (part?.filename && (part.body?.attachmentId || part.body?.data)) {
    attachments.push({
      filename: part.filename,
      mimeType: part.mimeType ?? "application/octet-stream",
      size: part.body.size ?? 0,
    });
  }

  for (const child of part?.parts ?? []) {
    collectAttachments(child, attachments);
  }

  return attachments;
}

/** Charge le contenu complet d'un message sans modifier son état dans Gmail. */
export async function getGmailMessage(
  accessToken: string,
  messageId: string,
): Promise<GmailMessageDetail> {
  const url = new URL(
    `${GMAIL_API_BASE}/users/me/messages/${encodeURIComponent(messageId)}`,
  );
  url.searchParams.set("format", "full");

  const message = await gmailRequest<GmailRawMessageResponse>(url, accessToken);
  const summary = normalizeMessage(message);
  const headers = message.payload?.headers;

  return {
    ...summary,
    cc: headerValue(headers, "cc"),
    replyTo: headerValue(headers, "reply-to"),
    bodyText: extractBodyText(message.payload),
    attachments: collectAttachments(message.payload),
  };
}

function splitRecipients(value: string) {
  return value
    .split(/[;,]/)
    .map((recipient) => recipient.trim())
    .filter(Boolean);
}

function encodeMimeHeader(value: string) {
  const normalized = value.replace(/[\r\n]+/g, " ").trim();
  const chunks: string[] = [];
  let currentChunk = "";

  for (const character of normalized) {
    if (
      currentChunk &&
      Buffer.byteLength(currentChunk + character, "utf8") > 36
    ) {
      chunks.push(currentChunk);
      currentChunk = character;
    } else {
      currentChunk += character;
    }
  }
  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks
    .map(
      (chunk) =>
        `=?UTF-8?B?${Buffer.from(chunk, "utf8").toString("base64")}?=`,
    )
    .join("\r\n ");
}

function createRecipientHeader(name: "To" | "Cc" | "Bcc", value: string) {
  const lines: string[] = [];
  let currentLine = `${name}:`;

  for (const recipient of splitRecipients(value)) {
    const addition = `${currentLine === `${name}:` ? " " : ", "}${recipient}`;
    if (
      currentLine !== `${name}:` &&
      currentLine.length + addition.length > 76
    ) {
      lines.push(`${currentLine},`);
      currentLine = ` ${recipient}`;
    } else {
      currentLine += addition;
    }
  }

  lines.push(currentLine);
  return lines.join("\r\n");
}

function wrapBase64(value: string) {
  return value.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function createRawEmail(from: string, message: GmailSendRequest) {
  const headers = [
    `From: ${from}`,
    createRecipientHeader("To", message.to),
    ...(message.cc.trim()
      ? [createRecipientHeader("Cc", message.cc)]
      : []),
    ...(message.bcc.trim()
      ? [createRecipientHeader("Bcc", message.bcc)]
      : []),
    `Subject: ${encodeMimeHeader(message.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  const encodedBody = wrapBase64(
    Buffer.from(message.body, "utf8").toString("base64"),
  );
  const mimeMessage = `${headers.join("\r\n")}\r\n\r\n${encodedBody}`;

  return Buffer.from(mimeMessage, "utf8").toString("base64url");
}

/** Envoie un nouveau message depuis le compte Gmail authentifié. */
export async function sendGmailMessage(
  accessToken: string,
  message: GmailSendRequest,
) {
  const profileUrl = new URL(`${GMAIL_API_BASE}/users/me/profile`);
  const profile = await gmailRequest<GmailProfileResponse>(
    profileUrl,
    accessToken,
  );

  if (!profile.emailAddress) {
    throw new GmailApiError(502);
  }

  const sendUrl = new URL(`${GMAIL_API_BASE}/users/me/messages/send`);
  const sentMessage = await gmailRequest<GmailSendApiResponse>(
    sendUrl,
    accessToken,
    {
      method: "POST",
      body: { raw: createRawEmail(profile.emailAddress, message) },
    },
  );

  if (!sentMessage.id) {
    throw new GmailApiError(502);
  }

  return {
    messageId: sentMessage.id,
    threadId: sentMessage.threadId ?? sentMessage.id,
  };
}
