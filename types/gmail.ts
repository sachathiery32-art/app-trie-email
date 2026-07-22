export type GmailMessageSummary = {
  id: string;
  threadId: string;
  senderName: string;
  senderEmail: string;
  recipients: string;
  subject: string;
  snippet: string;
  receivedAt: number;
  isUnread: boolean;
  isStarred: boolean;
  isImportant: boolean;
};

export type GmailAttachmentSummary = {
  filename: string;
  mimeType: string;
  size: number;
};

export type GmailMessageDetail = GmailMessageSummary & {
  cc: string;
  replyTo: string;
  bodyText: string;
  attachments: GmailAttachmentSummary[];
};

export type GmailInboxData = {
  accountEmail: string;
  mailboxMessageCount: number;
  mailboxThreadCount: number;
  inboxEstimate: number;
  hasMore: boolean;
  nextPageToken?: string;
  messages: GmailMessageSummary[];
  syncedAt: string;
};

export type GmailApiErrorResponse = {
  success: false;
  code:
    | "UNAUTHENTICATED"
    | "FORBIDDEN"
    | "RECONNECT_REQUIRED"
    | "VALIDATION_ERROR"
    | "GMAIL_ERROR";
  error: string;
};

export type GmailInboxResponse =
  | { success: true; data: GmailInboxData }
  | GmailApiErrorResponse;

export type GmailMessageResponse =
  | { success: true; data: GmailMessageDetail }
  | GmailApiErrorResponse;

export type GmailSendRequest = {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
};

export type GmailSendResponse =
  | {
      success: true;
      data: {
        messageId: string;
        threadId: string;
      };
    }
  | GmailApiErrorResponse;
