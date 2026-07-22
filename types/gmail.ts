export const GMAIL_MAILBOX_VIEWS = [
  "inbox",
  "starred",
  "sent",
  "drafts",
  "archive",
  "trash",
  "all",
] as const;

export type GmailMailboxView = (typeof GMAIL_MAILBOX_VIEWS)[number];

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
  labelIds: string[];
};

export type GmailAttachmentSummary = {
  id: string | null;
  filename: string;
  mimeType: string;
  size: number;
};

export type GmailMessageDetail = GmailMessageSummary & {
  cc: string;
  replyTo: string;
  bodyText: string;
  attachments: GmailAttachmentSummary[];
  messageIdHeader: string;
  references: string;
};

export type GmailLabelSummary = {
  id: string;
  name: string;
  type: "system" | "user";
  messagesTotal?: number;
  messagesUnread?: number;
  textColor?: string;
  backgroundColor?: string;
};

export type GmailInboxData = {
  accountEmail: string;
  mailboxMessageCount: number;
  mailboxThreadCount: number;
  view: GmailMailboxView;
  search: string;
  viewEstimate: number;
  hasMore: boolean;
  nextPageToken?: string;
  messages: GmailMessageSummary[];
  labels: GmailLabelSummary[];
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
  mode: "compose" | "reply" | "replyAll" | "forward";
  sourceMessageId?: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
};

export type GmailModifyAction =
  | "mark_read"
  | "mark_unread"
  | "star"
  | "unstar"
  | "archive"
  | "trash"
  | "restore"
  | "add_label"
  | "remove_label";

export type GmailModifyRequest = {
  action: GmailModifyAction;
  labelId?: string;
};

export type GmailModifyResponse =
  | { success: true }
  | GmailApiErrorResponse;

export type GmailSendResponse =
  | {
      success: true;
      data: {
        messageId: string;
        threadId: string;
      };
    }
  | GmailApiErrorResponse;
