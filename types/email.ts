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

export type ClassifyEmailSuccessResponse = {
  success: true;
  data: EmailClassification & {
    model: string;
  };
};

export type ClassifyEmailResponse =
  | ClassifyEmailSuccessResponse
  | ApiErrorResponse;
