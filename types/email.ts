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

export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

export type ClassifyEmailRequest = {
  sender: string;
  subject: string;
  body: string;
};

export type EmailClassification = {
  category: EmailCategory;
  reason: string;
};

/**
 * Représentation minimale d'un email dans l'interface de tri.
 * Cette forme pourra plus tard être alimentée par Gmail et la base de données.
 */
export type OrganizerEmail = ClassifyEmailRequest & {
  id: string;
  senderName: string;
  preview: string;
  receivedAt: string;
  category: EmailCategory;
  isRead: boolean;
  isStarred: boolean;
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
