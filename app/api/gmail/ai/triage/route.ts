import { NextResponse, type NextRequest } from "next/server";

import { GROQ_MODEL, UNTRUSTED_EMAIL_RULE } from "@/lib/ai-config";
import { applyAiLabelsBatch } from "@/lib/ai-labels";
import { aiRequestError } from "@/lib/ai-route";
import { getGmailMessage } from "@/lib/gmail";
import { gmailErrorResponse } from "@/lib/gmail-route";
import { getGoogleAccessToken } from "@/lib/google-session";
import { groq } from "@/lib/groq";
import {
  AI_EMAIL_CATEGORIES,
  AI_EMAIL_PRIORITIES,
  type GmailAiTriageItem,
  type GmailAiTriageResponse,
} from "@/types/ai";

export const dynamic = "force-dynamic";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

type TriageModelItem = Omit<GmailAiTriageItem, "appliedLabels">;

function json(payload: GmailAiTriageResponse, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function isTriageItem(value: unknown): value is TriageModelItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.messageId === "string" &&
    typeof item.summary === "string" &&
    typeof item.category === "string" &&
    AI_EMAIL_CATEGORIES.some((category) => category === item.category) &&
    typeof item.confidence === "number" &&
    item.confidence >= 0 &&
    item.confidence <= 100 &&
    typeof item.priority === "string" &&
    AI_EMAIL_PRIORITIES.some((priority) => priority === item.priority) &&
    typeof item.requiresReply === "boolean" &&
    typeof item.suggestedAction === "string"
  );
}

export async function POST(request: NextRequest) {
  const requestError = await aiRequestError(request);
  if (requestError) return requestError;

  const value: unknown = await request.json().catch(() => null);
  if (typeof value !== "object" || value === null) {
    return json({ success: false, error: "Le lot d'emails est invalide." }, 400);
  }
  const body = value as Record<string, unknown>;
  const messageIds = Array.isArray(body.messageIds)
    ? [...new Set(body.messageIds.filter((id): id is string => typeof id === "string"))]
    : [];
  if (
    messageIds.length === 0 ||
    messageIds.length > 10 ||
    messageIds.some((id) => !ID_PATTERN.test(id)) ||
    typeof body.applyLabels !== "boolean"
  ) {
    return json(
      { success: false, error: "Sélectionnez entre 1 et 10 emails valides." },
      400,
    );
  }

  try {
    const accessToken = await getGoogleAccessToken(request);
    const messages = [];
    for (let index = 0; index < messageIds.length; index += 5) {
      messages.push(
        ...(await Promise.all(
          messageIds
            .slice(index, index + 5)
            .map((messageId) => getGmailMessage(accessToken, messageId)),
        )),
      );
    }
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      max_tokens: 3_000,
      messages: [
        {
          role: "system",
          content: [
            "Tu tries une liste d'emails Gmail personnels en français.",
            "Retourne exactement un résultat par messageId fourni.",
            "N'invente pas d'information et réserve urgent aux risques ou échéances réellement proches.",
            UNTRUSTED_EMAIL_RULE,
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify(
            messages.map((message) => ({
              messageId: message.id,
              sender: message.senderEmail,
              subject: message.subject,
              date: new Date(message.receivedAt).toISOString(),
              body: message.bodyText.slice(0, 8_000),
              attachments: message.attachments.map((attachment) => attachment.filename),
            })),
          ),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "gmail_batch_triage",
          strict: true,
          schema: {
            type: "object",
            properties: {
              items: {
                type: "array",
                maxItems: 10,
                items: {
                  type: "object",
                  properties: {
                    messageId: { type: "string" },
                    summary: { type: "string" },
                    category: { type: "string", enum: [...AI_EMAIL_CATEGORIES] },
                    confidence: { type: "number", minimum: 0, maximum: 100 },
                    priority: { type: "string", enum: [...AI_EMAIL_PRIORITIES] },
                    requiresReply: { type: "boolean" },
                    suggestedAction: { type: "string" },
                  },
                  required: [
                    "messageId",
                    "summary",
                    "category",
                    "confidence",
                    "priority",
                    "requiresReply",
                    "suggestedAction",
                  ],
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
    const parsed: unknown = content ? JSON.parse(content) : null;
    const rawItems =
      typeof parsed === "object" &&
      parsed !== null &&
      Array.isArray((parsed as Record<string, unknown>).items)
        ? (parsed as { items: unknown[] }).items
        : [];
    const allowedIds = new Set(messageIds);
    if (
      rawItems.length !== messages.length ||
      !rawItems.every(isTriageItem) ||
      rawItems.some((item) => !allowedIds.has((item as TriageModelItem).messageId)) ||
      new Set(rawItems.map((item) => (item as TriageModelItem).messageId)).size !==
        rawItems.length
    ) {
      return json(
        { success: false, error: "Groq a retourné un tri incomplet." },
        502,
      );
    }

    const modelItems = rawItems as TriageModelItem[];
    const applied = body.applyLabels
      ? await applyAiLabelsBatch(
          accessToken,
          modelItems.map((item) => ({
            messageId: item.messageId,
            category: item.category,
            priority: item.priority,
            requiresReply: item.requiresReply,
          })),
          messages,
        )
      : new Map<string, string[]>();
    return json({
      success: true,
      data: {
        items: modelItems.map((item) => ({
          ...item,
          appliedLabels: applied.get(item.messageId) ?? [],
        })),
        model: completion.model,
      },
    });
  } catch (error) {
    console.error("Échec du tri Gmail avec Groq.", error);
    return gmailErrorResponse(error);
  }
}
