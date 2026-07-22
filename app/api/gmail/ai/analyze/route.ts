import { NextResponse, type NextRequest } from "next/server";

import { AI_INPUT_LIMITS, GROQ_MODEL, UNTRUSTED_EMAIL_RULE } from "@/lib/ai-config";
import { aiRequestError } from "@/lib/ai-route";
import { getGmailMessage, getGmailThread } from "@/lib/gmail";
import { gmailErrorResponse } from "@/lib/gmail-route";
import { getGoogleAccessToken } from "@/lib/google-session";
import { groq } from "@/lib/groq";
import {
  AI_EMAIL_CATEGORIES,
  AI_EMAIL_PRIORITIES,
  type GmailAiAnalysis,
  type GmailAiAnalysisResponse,
} from "@/types/ai";

export const dynamic = "force-dynamic";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function json(payload: GmailAiAnalysisResponse, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function validAnalysis(value: unknown): value is Omit<GmailAiAnalysis, "model"> {
  if (typeof value !== "object" || value === null) return false;
  const analysis = value as Record<string, unknown>;
  return (
    typeof analysis.summary === "string" &&
    analysis.summary.length > 0 &&
    typeof analysis.category === "string" &&
    AI_EMAIL_CATEGORIES.some((category) => category === analysis.category) &&
    typeof analysis.confidence === "number" &&
    analysis.confidence >= 0 &&
    analysis.confidence <= 100 &&
    typeof analysis.priority === "string" &&
    AI_EMAIL_PRIORITIES.some((priority) => priority === analysis.priority) &&
    typeof analysis.priorityReason === "string" &&
    typeof analysis.requiresReply === "boolean" &&
    typeof analysis.suggestedAction === "string" &&
    Array.isArray(analysis.actionItems) &&
    analysis.actionItems.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).title === "string" &&
        (typeof (item as Record<string, unknown>).dueDate === "string" ||
          (item as Record<string, unknown>).dueDate === null),
    ) &&
    Array.isArray(analysis.deadlines) &&
    analysis.deadlines.every((item) => typeof item === "string") &&
    Array.isArray(analysis.risks) &&
    analysis.risks.every((item) => typeof item === "string") &&
    Array.isArray(analysis.suggestedReplies) &&
    analysis.suggestedReplies.every((item) => typeof item === "string")
  );
}

export async function POST(request: NextRequest) {
  const requestError = await aiRequestError(request);
  if (requestError) return requestError;

  const body: unknown = await request.json().catch(() => null);
  const messageId =
    typeof body === "object" &&
    body !== null &&
    typeof (body as Record<string, unknown>).messageId === "string"
      ? (body as Record<string, string>).messageId
      : "";
  if (!ID_PATTERN.test(messageId)) {
    return json(
      { success: false, error: "L'email à analyser est invalide." },
      400,
    );
  }

  try {
    const accessToken = await getGoogleAccessToken(request);
    const selectedMessage = await getGmailMessage(accessToken, messageId);
    const thread = await getGmailThread(accessToken, selectedMessage.threadId);
    let remainingCharacters = AI_INPUT_LIMITS.threadCharacters;
    const conversation = thread.slice(-20).map((message) => {
      const content = message.bodyText.slice(0, Math.max(0, remainingCharacters));
      remainingCharacters -= content.length;
      return {
        id: message.id,
        from: message.senderEmail,
        to: message.recipients,
        date: new Date(message.receivedAt).toISOString(),
        subject: message.subject,
        body: content,
      };
    });

    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      max_tokens: 2_000,
      messages: [
        {
          role: "system",
          content: [
            "Tu es l'assistant de tri d'une boîte Gmail personnelle.",
            "Analyse la conversation en français et reste factuel.",
            "N'invente aucune échéance, somme ou obligation.",
            "Une réponse n'est requise que si le destinataire doit réellement agir ou confirmer.",
            "Propose au maximum trois réponses courtes, sans signature.",
            UNTRUSTED_EMAIL_RULE,
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({ selectedMessageId: messageId, conversation }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "gmail_conversation_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              summary: { type: "string" },
              category: { type: "string", enum: [...AI_EMAIL_CATEGORIES] },
              confidence: { type: "number", minimum: 0, maximum: 100 },
              priority: { type: "string", enum: [...AI_EMAIL_PRIORITIES] },
              priorityReason: { type: "string" },
              requiresReply: { type: "boolean" },
              suggestedAction: { type: "string" },
              actionItems: {
                type: "array",
                maxItems: 8,
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    dueDate: { type: ["string", "null"] },
                  },
                  required: ["title", "dueDate"],
                  additionalProperties: false,
                },
              },
              deadlines: { type: "array", maxItems: 8, items: { type: "string" } },
              risks: { type: "array", maxItems: 5, items: { type: "string" } },
              suggestedReplies: {
                type: "array",
                maxItems: 3,
                items: { type: "string" },
              },
            },
            required: [
              "summary",
              "category",
              "confidence",
              "priority",
              "priorityReason",
              "requiresReply",
              "suggestedAction",
              "actionItems",
              "deadlines",
              "risks",
              "suggestedReplies",
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const content = completion.choices[0]?.message.content;
    const analysis: unknown = content ? JSON.parse(content) : null;
    if (!validAnalysis(analysis)) {
      return json(
        { success: false, error: "Groq a retourné une analyse incomplète." },
        502,
      );
    }
    return json({
      success: true,
      data: { ...analysis, model: completion.model },
    });
  } catch (error) {
    console.error("Échec de l'analyse Gmail avec Groq.", error);
    return gmailErrorResponse(error);
  }
}
