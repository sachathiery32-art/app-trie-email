import { NextResponse } from "next/server";

import { checkAiRateLimit } from "@/lib/ai-rate-limit";
import { groq } from "@/lib/groq";
import {
  REPLY_TONES,
  type DraftMessageRequest,
  type DraftMessageResponse,
} from "@/types/email";

const MAX_RECIPIENT_LENGTH = 1_000;
const MAX_INSTRUCTION_LENGTH = 500;

function isDraftMessageRequest(value: unknown): value is DraftMessageRequest {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const requestBody = value as Record<string, unknown>;

  return (
    typeof requestBody.recipient === "string" &&
    requestBody.recipient.length <= MAX_RECIPIENT_LENGTH &&
    typeof requestBody.tone === "string" &&
    REPLY_TONES.some((tone) => tone === requestBody.tone) &&
    typeof requestBody.instruction === "string" &&
    requestBody.instruction.trim().length > 0 &&
    requestBody.instruction.length <= MAX_INSTRUCTION_LENGTH
  );
}

function isGeneratedDraft(
  value: unknown,
): value is { subject: string; body: string } {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const draft = value as Record<string, unknown>;

  return (
    typeof draft.subject === "string" &&
    draft.subject.trim().length > 0 &&
    draft.subject.length <= 500 &&
    typeof draft.body === "string" &&
    draft.body.trim().length > 0 &&
    draft.body.length <= 20_000
  );
}

/** Génère l'objet et le contenu d'un nouveau message fictif. */
export async function POST(request: Request) {
  const rateLimit = checkAiRateLimit(request);

  if (!rateLimit.allowed) {
    return NextResponse.json<DraftMessageResponse>(
      {
        success: false,
        error: "Trop de demandes IA. Réessayez dans quelques minutes.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const requestBody: unknown = await request.json().catch(() => null);

  if (!isDraftMessageRequest(requestBody)) {
    return NextResponse.json<DraftMessageResponse>(
      { success: false, error: "La demande de rédaction est invalide." },
      { status: 400 },
    );
  }

  try {
    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      messages: [
        {
          role: "system",
          content: [
            "Tu rédiges un nouveau message en français.",
            "Respecte l'objectif et le ton demandés sans inventer d'informations, d'engagements, de prix ou de dates.",
            "Rédige un email directement modifiable, sans adresse fictive ni signature automatique.",
            "Retourne uniquement un objet JSON conforme au schéma.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            recipient: requestBody.recipient.trim() || "non précisé",
            tone: requestBody.tone,
            objective: requestBody.instruction.trim(),
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "new_email_draft",
          strict: true,
          schema: {
            type: "object",
            properties: {
              subject: { type: "string" },
              body: { type: "string" },
            },
            required: ["subject", "body"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = completion.choices[0]?.message.content;
    const generatedDraft: unknown = content ? JSON.parse(content) : null;

    if (!isGeneratedDraft(generatedDraft)) {
      return NextResponse.json<DraftMessageResponse>(
        {
          success: false,
          error: "Groq a retourné un message inexploitable.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json<DraftMessageResponse>({
      success: true,
      data: {
        ...generatedDraft,
        model: completion.model,
      },
    });
  } catch (error) {
    console.error("Échec de la rédaction Groq :", error);

    return NextResponse.json<DraftMessageResponse>(
      {
        success: false,
        error: "Impossible de rédiger un message pour le moment.",
      },
      { status: 502 },
    );
  }
}
