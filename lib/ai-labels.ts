import "server-only";

import {
  AI_CATEGORY_LABELS,
  AI_PRIORITY_LABELS,
  type AiEmailCategory,
  type AiEmailPriority,
} from "@/types/ai";
import type { GmailMessageSummary } from "@/types/gmail";
import {
  applyGmailOrganizationLabels,
  ensureGmailLabels,
  listGmailLabels,
  setGmailMessageLabels,
} from "@/lib/gmail";

export const AI_LABEL_PREFIXES = [
  "AI/Catégorie/",
  "AI/Priorité/",
  "AI/Action/",
] as const;

export type AiLabelDecision = {
  messageId: string;
  category: AiEmailCategory;
  priority: AiEmailPriority;
  requiresReply: boolean;
};

export function aiLabelNames(
  decision: Omit<AiLabelDecision, "messageId">,
) {
  return [
    `AI/Catégorie/${AI_CATEGORY_LABELS[decision.category]}`,
    `AI/Priorité/${AI_PRIORITY_LABELS[decision.priority]}`,
    ...(decision.requiresReply ? ["AI/Action/Réponse requise"] : []),
  ];
}

export async function applyAiLabels(
  accessToken: string,
  decision: AiLabelDecision,
) {
  const names = aiLabelNames(decision);
  return applyGmailOrganizationLabels(
    accessToken,
    decision.messageId,
    names,
    [...AI_LABEL_PREFIXES],
  );
}

/** Applique un lot avec une seule création/liste de libellés. */
export async function applyAiLabelsBatch(
  accessToken: string,
  decisions: AiLabelDecision[],
  messages: GmailMessageSummary[],
) {
  const namesByMessage = new Map(
    decisions.map((decision) => [decision.messageId, aiLabelNames(decision)]),
  );
  const allDesiredNames = [...new Set([...namesByMessage.values()].flat())];
  await ensureGmailLabels(accessToken, allDesiredNames);
  const labels = await listGmailLabels(accessToken);
  const labelIdByName = new Map(labels.map((label) => [label.name, label.id]));
  const managedIds = new Set(
    labels
      .filter((label) =>
        AI_LABEL_PREFIXES.some((prefix) => label.name.startsWith(prefix)),
      )
      .map((label) => label.id),
  );
  const messageById = new Map(messages.map((message) => [message.id, message]));
  const appliedNames = new Map<string, string[]>();

  for (let index = 0; index < decisions.length; index += 4) {
    await Promise.all(
      decisions.slice(index, index + 4).map(async (decision) => {
        const message = messageById.get(decision.messageId);
        const desiredNames = namesByMessage.get(decision.messageId) ?? [];
        if (!message) return;
        const desiredIds = new Set(
          desiredNames
            .map((name) => labelIdByName.get(name))
            .filter((id): id is string => Boolean(id)),
        );
        const currentIds = new Set(message.labelIds);
        const addLabelIds = [...desiredIds].filter((id) => !currentIds.has(id));
        const removeLabelIds = message.labelIds.filter(
          (id) => managedIds.has(id) && !desiredIds.has(id),
        );
        if (addLabelIds.length || removeLabelIds.length) {
          await setGmailMessageLabels(accessToken, decision.messageId, {
            addLabelIds,
            removeLabelIds,
          });
        }
        appliedNames.set(decision.messageId, desiredNames);
      }),
    );
  }

  return appliedNames;
}
