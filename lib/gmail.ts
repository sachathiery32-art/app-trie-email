import type {
  GmailInboxData,
  GmailMessageSummary,
} from "@/types/gmail";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";
const FIRST_INBOX_PAGE_SIZE = 20;

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

type GmailMessageResponse = {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: {
    headers?: GmailHeader[];
  };
};

export class GmailApiError extends Error {
  constructor(public readonly status: number) {
    super(`Gmail API error (${status})`);
    this.name = "GmailApiError";
  }
}

async function gmailRequest<T>(url: URL, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
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

function normalizeMessage(message: GmailMessageResponse): GmailMessageSummary {
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

  return gmailRequest<GmailMessageResponse>(url, accessToken);
}

/**
 * Charge uniquement la première page de la boîte de réception. Gmail renvoie
 * d'abord des identifiants, puis un appel `messages.get` fournit les métadonnées.
 */
export async function listFirstGmailInboxPage(
  accessToken: string,
): Promise<GmailInboxData> {
  const listUrl = new URL(`${GMAIL_API_BASE}/users/me/messages`);
  listUrl.searchParams.set("maxResults", String(FIRST_INBOX_PAGE_SIZE));
  listUrl.searchParams.set("labelIds", "INBOX");
  listUrl.searchParams.set("includeSpamTrash", "false");

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
    messages.push(...metadata.map(normalizeMessage).filter((message) => message.id));
  }

  return {
    accountEmail: profile.emailAddress ?? "",
    mailboxMessageCount: profile.messagesTotal ?? 0,
    mailboxThreadCount: profile.threadsTotal ?? 0,
    inboxEstimate: list.resultSizeEstimate ?? messages.length,
    hasMore: Boolean(list.nextPageToken),
    messages,
    syncedAt: new Date().toISOString(),
  };
}
