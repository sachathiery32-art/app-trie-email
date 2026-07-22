import type { ApiErrorResponse } from "@/types/api";

export const EMAIL_CATEGORIES = [
  "professional",
  "personal",
  "newsletter",
  "promotion",
  "notification",
  "spam",
  "other",
] as const;

export const MAILBOX_FOLDERS = [
  "inbox",
  "sent",
  "drafts",
  "archive",
  "trash",
] as const;

export const REPLY_TONES = ["concise", "professional", "friendly"] as const;

export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];
export type MailboxFolder = (typeof MAILBOX_FOLDERS)[number];
export type MailboxView = MailboxFolder | "starred";
export type ReplyTone = (typeof REPLY_TONES)[number];
export type ComposerMode =
  | "compose"
  | "reply"
  | "replyAll"
  | "forward"
  | "draft";

export type EmailContent = {
  sender: string;
  subject: string;
  body: string;
};

export type OrganizerEmail = EmailContent & {
  id: string;
  senderName: string;
  recipients: string[];
  cc: string[];
  bcc: string[];
  preview: string;
  receivedAt: string;
  timestamp: number;
  category: EmailCategory;
  folder: MailboxFolder;
  direction: "incoming" | "outgoing";
  isRead: boolean;
  isStarred: boolean;
  sourceEmailId?: string;
};

export type ComposerSession = {
  mode: ComposerMode;
  draftId?: string;
  sourceEmailId?: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
};

export type ComposerMessage = Pick<
  ComposerSession,
  "to" | "cc" | "bcc" | "subject" | "body"
>;

export type ClassifyEmailRequest = {
  emailId: string;
};

export type EmailClassification = {
  category: EmailCategory;
  reason: string;
};

export type ClassifyEmailSuccessResponse = {
  success: true;
  data: EmailClassification & {
    model: string;
  };
};

export type ClassifyEmailResponse =
  | ClassifyEmailSuccessResponse
  | ApiErrorResponse;

export type DraftReplyRequest = {
  emailId: string;
  tone: ReplyTone;
  instruction: string;
};

export type DraftMessageRequest = {
  recipient: string;
  tone: ReplyTone;
  instruction: string;
};

export type GeneratedDraftSuccessResponse = {
  success: true;
  data: {
    subject: string;
    body: string;
    model: string;
  };
};

export type DraftReplyResponse =
  | GeneratedDraftSuccessResponse
  | ApiErrorResponse;

export type DraftMessageResponse =
  | GeneratedDraftSuccessResponse
  | ApiErrorResponse;
