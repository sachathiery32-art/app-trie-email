import type { ApiErrorResponse } from "@/types/api";

export const AI_EMAIL_CATEGORIES = [
  "client",
  "prospect",
  "project",
  "team",
  "supplier",
  "calendar",
  "personal",
  "finance",
  "administration",
  "purchase",
  "newsletter",
  "promotion",
  "notification",
  "security",
  "spam",
  "other",
] as const;

export const AI_EMAIL_PRIORITIES = ["urgent", "high", "normal", "low"] as const;

export const AI_REWRITE_ACTIONS = [
  "proofread",
  "shorten",
  "expand",
  "professional",
  "friendly",
] as const;

export type AiEmailCategory = (typeof AI_EMAIL_CATEGORIES)[number];
export type AiEmailPriority = (typeof AI_EMAIL_PRIORITIES)[number];
export type AiRewriteAction = (typeof AI_REWRITE_ACTIONS)[number];

export const AI_CATEGORY_LABELS: Record<AiEmailCategory, string> = {
  client: "Clients",
  prospect: "Prospects et ventes",
  project: "Projets",
  team: "Équipe et partenaires",
  supplier: "Fournisseurs",
  calendar: "Rendez-vous",
  personal: "Personnel",
  finance: "Factures et finances",
  administration: "Administration",
  purchase: "Achats et livraisons",
  newsletter: "Newsletters",
  promotion: "Promotions",
  notification: "Notifications",
  security: "Sécurité",
  spam: "Indésirable",
  other: "Autres",
};

export const AI_CATEGORY_GROUPS = [
  {
    id: "business",
    label: "Activité commerciale",
    categories: ["client", "prospect"],
  },
  {
    id: "projects",
    label: "Projets",
    categories: ["project", "team"],
  },
  {
    id: "operations",
    label: "Opérations",
    categories: ["supplier", "calendar", "purchase"],
  },
  {
    id: "management",
    label: "Gestion",
    categories: ["finance", "administration", "security"],
  },
  {
    id: "communication",
    label: "Communication",
    categories: ["newsletter", "promotion", "notification"],
  },
  {
    id: "private",
    label: "Privé",
    categories: ["personal", "spam", "other"],
  },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  categories: readonly AiEmailCategory[];
}>;

export function aiCategoryFolderName(category: AiEmailCategory) {
  const group = AI_CATEGORY_GROUPS.find((item) =>
    (item.categories as readonly AiEmailCategory[]).includes(category),
  );
  return `AI/${group?.label ?? "Autres"}`;
}

export function aiCategoryLabelName(category: AiEmailCategory) {
  return `${aiCategoryFolderName(category)}/${AI_CATEGORY_LABELS[category]}`;
}

export const AI_PRIORITY_LABELS: Record<AiEmailPriority, string> = {
  urgent: "Urgent",
  high: "Haute",
  normal: "Normale",
  low: "Basse",
};

export type AiActionItem = {
  title: string;
  dueDate: string | null;
};

export type GmailAiAnalysis = {
  summary: string;
  category: AiEmailCategory;
  confidence: number;
  priority: AiEmailPriority;
  priorityReason: string;
  requiresReply: boolean;
  suggestedAction: string;
  actionItems: AiActionItem[];
  deadlines: string[];
  risks: string[];
  suggestedReplies: string[];
  model: string;
};

export type GmailAiAnalysisResponse =
  | { success: true; data: GmailAiAnalysis }
  | ApiErrorResponse;

export type GmailAiApplyResponse =
  | {
      success: true;
      data: { appliedLabels: string[] };
    }
  | ApiErrorResponse;

export type GmailAiTriageItem = Pick<
  GmailAiAnalysis,
  | "summary"
  | "category"
  | "confidence"
  | "priority"
  | "requiresReply"
  | "suggestedAction"
> & {
  messageId: string;
  appliedLabels: string[];
};

export type GmailAiTriageResponse =
  | {
      success: true;
      data: {
        items: GmailAiTriageItem[];
        model: string;
      };
    }
  | ApiErrorResponse;

export type GmailAiSearchSource = {
  messageId: string;
  sender: string;
  subject: string;
  receivedAt: number;
};

export type GmailAiSearchResponse =
  | {
      success: true;
      data: {
        answer: string;
        gmailQuery: string;
        sources: GmailAiSearchSource[];
        model: string;
      };
    }
  | ApiErrorResponse;

export type GmailAiRewriteResponse =
  | {
      success: true;
      data: {
        subject: string;
        body: string;
        model: string;
      };
    }
  | ApiErrorResponse;

export type GmailAttachmentAnalysis = {
  summary: string;
  documentType: string;
  keyFacts: string[];
  dates: string[];
  amounts: string[];
  actionItems: string[];
  warnings: string[];
  model: string;
};

export type GmailAttachmentAnalysisResponse =
  | { success: true; data: GmailAttachmentAnalysis }
  | ApiErrorResponse;

export type AiUserPreferences = {
  autoTriage: boolean;
  writingStyle: string;
};
