import type { EmailCategory } from "@/types/email";

/** Libellés partagés par toutes les interfaces qui affichent une catégorie. */
export const EMAIL_CATEGORY_LABELS = {
  professional: "Travail",
  personal: "Personnel",
  newsletter: "Newsletters",
  promotion: "Promotions",
  notification: "Notifications",
  spam: "Spam",
  other: "À classer",
} satisfies Record<EmailCategory, string>;
