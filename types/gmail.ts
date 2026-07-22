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

export type GmailInboxData = {
  accountEmail: string;
  mailboxMessageCount: number;
  mailboxThreadCount: number;
  inboxEstimate: number;
  hasMore: boolean;
  messages: GmailMessageSummary[];
  syncedAt: string;
};

export type GmailInboxResponse =
  | { success: true; data: GmailInboxData }
  | {
      success: false;
      code:
        | "UNAUTHENTICATED"
        | "FORBIDDEN"
        | "RECONNECT_REQUIRED"
        | "GMAIL_ERROR";
      error: string;
    };
