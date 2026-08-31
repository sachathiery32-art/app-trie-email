import "server-only";

import { AI_MODEL, UNTRUSTED_EMAIL_RULE } from "@/lib/ai-config";
import { applyAiLabelsBatch } from "@/lib/ai-labels";
import { getGmailMessage, listGmailLabels } from "@/lib/gmail";
import { xkiro } from "@/lib/xkiro";
import {
  AI_EMAIL_CATEGORIES,
  AI_EMAIL_PRIORITIES,
  type GmailAiTriageItem,
} from "@/types/ai";

type TriageModelItem = Omit<GmailAiTriageItem, "appliedLabels">;

function isTriageItem(value: unknown, folders: ReadonlySet<string>): value is TriageModelItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.messageId === "string" &&
    typeof item.summary === "string" &&
    typeof item.category === "string" && AI_EMAIL_CATEGORIES.some((value) => value === item.category) &&
    typeof item.confidence === "number" && item.confidence >= 0 && item.confidence <= 100 &&
    typeof item.priority === "string" && AI_EMAIL_PRIORITIES.some((value) => value === item.priority) &&
    typeof item.requiresReply === "boolean" &&
    (item.customFolder === null || (typeof item.customFolder === "string" && folders.has(item.customFolder))) &&
    typeof item.suggestedAction === "string"
  );
}

/** Classe un lot serveur sans dépendre d'une requête navigateur. */
export async function triageGmailMessages(accessToken: string, messageIds: string[]) {
  const ids = [...new Set(messageIds)].slice(0, 10);
  if (!ids.length) return [];
  const labels = await listGmailLabels(accessToken);
  const personalNames = labels
    .filter((label) => label.type === "user" && label.name.startsWith("Dossiers/"))
    .map((label) => label.name);
  const customFolders = personalNames
    .filter((name) => !personalNames.some((candidate) => candidate.startsWith(`${name}/`)))
    .slice(0, 25);
  const allowedFolders = new Set(customFolders);
  const messages = await Promise.all(ids.map((id) => getGmailMessage(accessToken, id)));
  const completion = await xkiro.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 2_500,
    reasoning_effort: "low",
    messages: [
      {
        role: "system",
        content: [
          "Tu tries automatiquement la boîte Gmail d'un entrepreneur en français.",
          "Utilise customFolder uniquement si un dossier fourni correspond clairement, en recopiant son nom exact. Sinon retourne null.",
          "Retourne exactement un résultat par messageId. Résumé et action tiennent en une phrase courte.",
          "N'invente rien et réserve urgent aux échéances ou risques proches.",
          UNTRUSTED_EMAIL_RULE,
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          availableCustomFolders: customFolders,
          emails: messages.map((message) => ({
            messageId: message.id,
            sender: message.senderEmail,
            subject: message.subject,
            date: new Date(message.receivedAt).toISOString(),
            body: message.bodyText.slice(0, 1_200),
            attachments: message.attachments.map((attachment) => attachment.filename),
          })),
        }),
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "gmail_background_triage",
        strict: true,
        schema: {
          type: "object",
          properties: {
            items: {
              type: "array",
              minItems: ids.length,
              maxItems: ids.length,
              items: {
                type: "object",
                properties: {
                  messageId: { type: "string" },
                  summary: { type: "string" },
                  category: { type: "string", enum: [...AI_EMAIL_CATEGORIES] },
                  confidence: { type: "number", minimum: 0, maximum: 100 },
                  priority: { type: "string", enum: [...AI_EMAIL_PRIORITIES] },
                  requiresReply: { type: "boolean" },
                  customFolder: { type: ["string", "null"], enum: [...customFolders, null] },
                  suggestedAction: { type: "string" },
                },
                required: ["messageId", "summary", "category", "confidence", "priority", "requiresReply", "customFolder", "suggestedAction"],
                additionalProperties: false,
              },
            },
          },
          required: ["items"],
          additionalProperties: false,
        },
      },
    },
  });
  const content = completion.choices[0]?.message.content;
  const parsed = content ? JSON.parse(content) as { items?: unknown[] } : null;
  const rawItems = parsed?.items ?? [];
  const allowedIds = new Set(ids);
  if (
    rawItems.length !== ids.length ||
    !rawItems.every((item) => isTriageItem(item, allowedFolders)) ||
    rawItems.some((item) => !allowedIds.has((item as TriageModelItem).messageId))
  ) throw new Error("xKiro a retourné un tri serveur incomplet.");
  const items = rawItems as TriageModelItem[];
  const applied = await applyAiLabelsBatch(
    accessToken,
    items.map((item) => ({
      messageId: item.messageId,
      category: item.category,
      priority: item.priority,
      requiresReply: item.requiresReply,
      customFolder: item.customFolder,
    })),
    messages,
  );
  return items.map((item) => ({ ...item, appliedLabels: applied.get(item.messageId) ?? [] }));
}
