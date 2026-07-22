import type {
  GmailAttachmentSummary,
  GmailInboxData,
  GmailLabelSummary,
  GmailMailboxView,
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

type GmailThreadResponse = {
  id?: string;
  messages?: GmailRawMessageResponse[];
};

type GmailSendApiResponse = {
  id?: string;
  threadId?: string;
};

type GmailLabelResponse = {
  id?: string;
  name?: string;
  type?: "system" | "user";
  messagesTotal?: number;
  messagesUnread?: number;
  color?: {
    textColor?: string;
    backgroundColor?: string;
  };
};

type GmailLabelsListResponse = {
  labels?: GmailLabelResponse[];
};

type GmailAttachmentBodyResponse = {
  attachmentId?: string;
  size?: number;
  data?: string;
};

export type GmailOutgoingAttachment = {
  filename: string;
  mimeType: string;
  data: Buffer;
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
  options?: { method?: "POST"; body?: unknown },
): Promise<T> {
  const hasBody = options?.body !== undefined;
  const response = await fetch(url, {
    method: options?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
    },
    body: hasBody ? JSON.stringify(options.body) : undefined,
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
    labelIds: [...labels],
  };
}

async function getMessageMetadata(id: string, accessToken: string) {
  const url = new URL(`${GMAIL_API_BASE}/users/me/messages/${id}`);
  url.searchParams.set("format", "metadata");

  for (const header of ["From", "To", "Cc", "Subject", "Date"]) {
    url.searchParams.append("metadataHeaders", header);
  }

  return gmailRequest<GmailRawMessageResponse>(url, accessToken);
}

/**
 * Charge une page de la boîte de réception. Gmail renvoie d'abord des
 * identifiants, puis un appel `messages.get` fournit les métadonnées.
 */
function viewParameters(view: GmailMailboxView) {
  switch (view) {
    case "inbox":
      return { labelId: "INBOX", query: "", includeSpamTrash: false };
    case "starred":
      return { labelId: "STARRED", query: "", includeSpamTrash: false };
    case "sent":
      return { labelId: "SENT", query: "", includeSpamTrash: false };
    case "drafts":
      return { labelId: "DRAFT", query: "", includeSpamTrash: false };
    case "archive":
      return {
        query: "-label:inbox -label:sent -label:drafts -label:trash -label:spam",
        includeSpamTrash: false,
      };
    case "trash":
      return { labelId: "TRASH", query: "", includeSpamTrash: true };
    case "all":
      return { query: "", includeSpamTrash: false };
  }
}

function normalizeLabel(label: GmailLabelResponse): GmailLabelSummary | null {
  if (!label.id || !label.name || !label.type) {
    return null;
  }

  return {
    id: label.id,
    name: label.name,
    type: label.type,
    messagesTotal: label.messagesTotal,
    messagesUnread: label.messagesUnread,
    textColor: label.color?.textColor,
    backgroundColor: label.color?.backgroundColor,
  };
}

/** Retourne les libellés système et personnels du compte. */
export async function listGmailLabels(accessToken: string) {
  const url = new URL(`${GMAIL_API_BASE}/users/me/labels`);
  const response = await gmailRequest<GmailLabelsListResponse>(url, accessToken);
  return (response.labels ?? [])
    .map(normalizeLabel)
    .filter((label): label is GmailLabelSummary => Boolean(label));
}

async function createGmailLabel(accessToken: string, name: string) {
  const url = new URL(`${GMAIL_API_BASE}/users/me/labels`);
  const label = await gmailRequest<GmailLabelResponse>(url, accessToken, {
    method: "POST",
    body: {
      name,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    },
  });
  const normalized = normalizeLabel(label);
  if (!normalized) throw new GmailApiError(502);
  return normalized;
}

/** Crée uniquement les libellés absents et retourne leur version Gmail. */
export async function ensureGmailLabels(
  accessToken: string,
  names: string[],
) {
  let labels = await listGmailLabels(accessToken);
  const result: GmailLabelSummary[] = [];

  for (const name of [...new Set(names)]) {
    let label = labels.find(
      (candidate) => candidate.name.toLocaleLowerCase("fr-FR") === name.toLocaleLowerCase("fr-FR"),
    );
    if (!label) {
      try {
        label = await createGmailLabel(accessToken, name);
        labels = [...labels, label];
      } catch (error) {
        // Une création concurrente peut gagner la course : relire avant d'échouer.
        labels = await listGmailLabels(accessToken);
        label = labels.find(
          (candidate) =>
            candidate.name.toLocaleLowerCase("fr-FR") ===
            name.toLocaleLowerCase("fr-FR"),
        );
        if (!label) throw error;
      }
    }
    result.push(label);
  }
  return result;
}

/** Charge une page d'une vue Gmail ainsi que les libellés disponibles. */
export async function listGmailMailboxPage(
  accessToken: string,
  options: {
    view: GmailMailboxView;
    pageToken?: string;
    search?: string;
  },
): Promise<GmailInboxData> {
  const { view, pageToken, search = "" } = options;
  const viewFilter = viewParameters(view);
  const listUrl = new URL(`${GMAIL_API_BASE}/users/me/messages`);
  listUrl.searchParams.set("maxResults", String(INBOX_PAGE_SIZE));
  if (viewFilter.labelId) {
    listUrl.searchParams.set("labelIds", viewFilter.labelId);
  }
  listUrl.searchParams.set(
    "includeSpamTrash",
    String(viewFilter.includeSpamTrash),
  );
  const query = [viewFilter.query, search.trim()].filter(Boolean).join(" ");
  if (query) {
    listUrl.searchParams.set("q", query);
  }
  if (pageToken) {
    listUrl.searchParams.set("pageToken", pageToken);
  }

  const profileUrl = new URL(`${GMAIL_API_BASE}/users/me/profile`);
  const [list, profile, labels] = await Promise.all([
    gmailRequest<GmailListResponse>(listUrl, accessToken),
    gmailRequest<GmailProfileResponse>(profileUrl, accessToken),
    listGmailLabels(accessToken),
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
    view,
    search: search.trim(),
    viewEstimate: list.resultSizeEstimate ?? messages.length,
    hasMore: Boolean(list.nextPageToken),
    nextPageToken: list.nextPageToken,
    messages,
    labels,
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
      id: part.body.attachmentId ?? null,
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

function normalizeMessageDetail(
  message: GmailRawMessageResponse,
): GmailMessageDetail {
  const summary = normalizeMessage(message);
  const headers = message.payload?.headers;

  return {
    ...summary,
    cc: headerValue(headers, "cc"),
    replyTo: headerValue(headers, "reply-to"),
    bodyText: extractBodyText(message.payload),
    attachments: collectAttachments(message.payload),
    messageIdHeader: headerValue(headers, "message-id"),
    references: headerValue(headers, "references"),
  };
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
  return normalizeMessageDetail(message);
}

/** Charge tous les messages d'une conversation Gmail dans l'ordre. */
export async function getGmailThread(
  accessToken: string,
  threadId: string,
) {
  const url = new URL(
    `${GMAIL_API_BASE}/users/me/threads/${encodeURIComponent(threadId)}`,
  );
  url.searchParams.set("format", "full");
  const thread = await gmailRequest<GmailThreadResponse>(url, accessToken);
  return (thread.messages ?? [])
    .map(normalizeMessageDetail)
    .filter((message) => message.id);
}

/** Recherche dans Gmail puis charge le contenu des premiers résultats. */
export async function searchGmailMessages(
  accessToken: string,
  query: string,
  maxResults = 8,
) {
  const url = new URL(`${GMAIL_API_BASE}/users/me/messages`);
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(Math.min(Math.max(maxResults, 1), 20)));
  url.searchParams.set("includeSpamTrash", "false");
  const result = await gmailRequest<GmailListResponse>(url, accessToken);
  const ids = (result.messages ?? [])
    .map((message) => message.id)
    .filter((id): id is string => Boolean(id));

  const messages: GmailMessageDetail[] = [];
  for (let index = 0; index < ids.length; index += 5) {
    messages.push(
      ...(await Promise.all(
        ids.slice(index, index + 5).map((id) => getGmailMessage(accessToken, id)),
      )),
    );
  }
  return messages;
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

function sanitizeMessageReferences(value: string) {
  return (value.match(/<[^<>\r\n]{1,998}>/g) ?? []).join(" ").slice(0, 4_000);
}

function sanitizeMimeType(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/.test(
    value,
  )
    ? value
    : "application/octet-stream";
}

function sanitizeFilename(value: string) {
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/"]/g, "_")
    .trim()
    .slice(0, 180);
  return cleaned || "piece-jointe";
}

function asciiFilename(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/[\\/"]/g, "_");
}

function createRawEmail(
  from: string,
  message: GmailSendRequest,
  attachments: GmailOutgoingAttachment[],
  replyHeaders?: { inReplyTo: string; references: string },
) {
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
    ...(replyHeaders?.inReplyTo
      ? [`In-Reply-To: ${replyHeaders.inReplyTo}`]
      : []),
    ...(replyHeaders?.references
      ? [`References: ${replyHeaders.references}`]
      : []),
    "MIME-Version: 1.0",
  ];
  const encodedBody = wrapBase64(
    Buffer.from(message.body, "utf8").toString("base64"),
  );

  if (attachments.length === 0) {
    const mimeMessage = `${[
      ...headers,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
    ].join("\r\n")}\r\n\r\n${encodedBody}`;
    return Buffer.from(mimeMessage, "utf8").toString("base64url");
  }

  const boundary = `email-organizer-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
  const parts = [
    `--${boundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${encodedBody}`,
    ...attachments.map((attachment) => {
      const filename = sanitizeFilename(attachment.filename);
      const fallbackName = asciiFilename(filename);
      const encodedName = encodeURIComponent(filename).replace(
        /[!'()*]/g,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
      );

      return [
        `--${boundary}`,
        `Content-Type: ${sanitizeMimeType(attachment.mimeType)}; name="${fallbackName}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
        "",
        wrapBase64(attachment.data.toString("base64")),
      ].join("\r\n");
    }),
    `--${boundary}--`,
  ];
  const mimeMessage = `${[
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ].join("\r\n")}\r\n\r\n${parts.join("\r\n")}`;

  return Buffer.from(mimeMessage, "utf8").toString("base64url");
}

/** Envoie un message, une réponse ou un transfert depuis Gmail. */
export async function sendGmailMessage(
  accessToken: string,
  message: GmailSendRequest,
  attachments: GmailOutgoingAttachment[] = [],
) {
  const profileUrl = new URL(`${GMAIL_API_BASE}/users/me/profile`);
  const profile = await gmailRequest<GmailProfileResponse>(
    profileUrl,
    accessToken,
  );

  if (!profile.emailAddress) {
    throw new GmailApiError(502);
  }

  const isReply = message.mode === "reply" || message.mode === "replyAll";
  const sourceMessage =
    isReply && message.sourceMessageId
      ? await getGmailMessage(accessToken, message.sourceMessageId)
      : null;
  if (isReply && !sourceMessage) {
    throw new GmailApiError(400);
  }

  const sourceMessageIdHeader = sourceMessage
    ? sanitizeMessageReferences(sourceMessage.messageIdHeader)
    : "";
  const referenceChain = sourceMessage
    ? [sanitizeMessageReferences(sourceMessage.references), sourceMessageIdHeader]
        .filter(Boolean)
        .join(" ")
        .trim()
    : "";
  const messageForDelivery = sourceMessage
    ? {
        ...message,
        subject: /^re\s*:/i.test(sourceMessage.subject)
          ? sourceMessage.subject
          : `Re: ${sourceMessage.subject}`,
      }
    : message;

  const sendUrl = new URL(`${GMAIL_API_BASE}/users/me/messages/send`);
  const sentMessage = await gmailRequest<GmailSendApiResponse>(
    sendUrl,
    accessToken,
    {
      method: "POST",
      body: {
        raw: createRawEmail(
          profile.emailAddress,
          messageForDelivery,
          attachments,
          sourceMessage
            ? {
                inReplyTo: sourceMessageIdHeader,
                references: referenceChain,
              }
            : undefined,
        ),
        ...(sourceMessage ? { threadId: sourceMessage.threadId } : {}),
      },
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

/** Applique une action Gmail en utilisant les libellés système officiels. */
export async function modifyGmailMessage(
  accessToken: string,
  messageId: string,
  action:
    | "mark_read"
    | "mark_unread"
    | "star"
    | "unstar"
    | "archive"
    | "trash"
    | "restore"
    | "add_label"
    | "remove_label",
  labelId?: string,
) {
  const baseUrl = `${GMAIL_API_BASE}/users/me/messages/${encodeURIComponent(messageId)}`;

  if (action === "trash" || action === "restore") {
    const actionUrl = new URL(
      `${baseUrl}/${action === "trash" ? "trash" : "untrash"}`,
    );
    await gmailRequest<GmailRawMessageResponse>(actionUrl, accessToken, {
      method: "POST",
    });

    if (action === "restore") {
      const modifyUrl = new URL(`${baseUrl}/modify`);
      await gmailRequest<GmailRawMessageResponse>(modifyUrl, accessToken, {
        method: "POST",
        body: { addLabelIds: ["INBOX"] },
      });
    }
    return;
  }

  const changes = {
    mark_read: { removeLabelIds: ["UNREAD"] },
    mark_unread: { addLabelIds: ["UNREAD"] },
    star: { addLabelIds: ["STARRED"] },
    unstar: { removeLabelIds: ["STARRED"] },
    archive: { removeLabelIds: ["INBOX"] },
    add_label: { addLabelIds: labelId ? [labelId] : [] },
    remove_label: { removeLabelIds: labelId ? [labelId] : [] },
  } as const;
  const modifyUrl = new URL(`${baseUrl}/modify`);
  await gmailRequest<GmailRawMessageResponse>(modifyUrl, accessToken, {
    method: "POST",
    body: changes[action],
  });
}

/** Ajoute et retire plusieurs libellés Gmail en un seul appel. */
export async function setGmailMessageLabels(
  accessToken: string,
  messageId: string,
  changes: { addLabelIds?: string[]; removeLabelIds?: string[] },
) {
  const url = new URL(
    `${GMAIL_API_BASE}/users/me/messages/${encodeURIComponent(messageId)}/modify`,
  );
  await gmailRequest<GmailRawMessageResponse>(url, accessToken, {
    method: "POST",
    body: {
      addLabelIds: [...new Set(changes.addLabelIds ?? [])],
      removeLabelIds: [...new Set(changes.removeLabelIds ?? [])],
    },
  });
}

/** Remplace uniquement les familles de libellés IA sans toucher aux autres. */
export async function applyGmailOrganizationLabels(
  accessToken: string,
  messageId: string,
  desiredNames: string[],
  managedPrefixes: string[],
) {
  const desiredLabels = await ensureGmailLabels(accessToken, desiredNames);
  const [allLabels, message] = await Promise.all([
    listGmailLabels(accessToken),
    getGmailMessage(accessToken, messageId),
  ]);
  const desiredIds = new Set(desiredLabels.map((label) => label.id));
  const managedIds = new Set(
    allLabels
      .filter((label) =>
        managedPrefixes.some((prefix) => label.name.startsWith(prefix)),
      )
      .map((label) => label.id),
  );
  const currentIds = new Set(message.labelIds);
  const addLabelIds = [...desiredIds].filter((id) => !currentIds.has(id));
  const removeLabelIds = message.labelIds.filter(
    (id) => managedIds.has(id) && !desiredIds.has(id),
  );

  if (addLabelIds.length || removeLabelIds.length) {
    await setGmailMessageLabels(accessToken, messageId, {
      addLabelIds,
      removeLabelIds,
    });
  }
  return desiredLabels.map((label) => label.name);
}

/** Télécharge une pièce jointe encodée en base64url par Gmail. */
export async function downloadGmailAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string,
) {
  const url = new URL(
    `${GMAIL_API_BASE}/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
  );
  const attachment = await gmailRequest<GmailAttachmentBodyResponse>(
    url,
    accessToken,
  );

  if (!attachment.data) {
    throw new GmailApiError(502);
  }
  if ((attachment.size ?? 0) > 3 * 1024 * 1024) {
    throw new GmailApiError(413);
  }

  return Buffer.from(
    attachment.data.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  );
}
