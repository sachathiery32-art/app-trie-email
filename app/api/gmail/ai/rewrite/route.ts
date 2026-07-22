import { NextResponse, type NextRequest } from "next/server";

import { GROQ_MODEL, UNTRUSTED_EMAIL_RULE } from "@/lib/ai-config";
import { aiRequestError } from "@/lib/ai-route";
import { groq } from "@/lib/groq";
import {
  AI_REWRITE_ACTIONS,
  type GmailAiRewriteResponse,
} from "@/types/ai";

export const dynamic = "force-dynamic";

const ACTION_INSTRUCTIONS = {
  proofread: "Corrige l'orthographe, la grammaire, la ponctuation et les maladresses sans changer le sens.",
  shorten: "Raccourcis nettement le message en conservant toutes les informations indispensables.",
  expand: "Développe le message de façon utile et structurée sans inventer de faits.",
  professional: "Adopte un ton professionnel, clair, poli et direct.",
  friendly: "Adopte un ton chaleureux, naturel et respectueux.",
} as const;

function json(payload: GmailAiRewriteResponse, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: NextRequest) {
  const requestError = await aiRequestError(request);
  if (requestError) return requestError;

  const value: unknown = await request.json().catch(() => null);
  if (typeof value !== "object" || value === null) {
    return json({ success: false, error: "Le message est invalide." }, 400);
  }
  const body = value as Record<string, unknown>;
  const action = AI_REWRITE_ACTIONS.find((item) => item === body.action);
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const message = typeof body.body === "string" ? body.body.trim() : "";
  const writingStyle =
    typeof body.writingStyle === "string" ? body.writingStyle.trim() : "";
  if (
    !action ||
    !message ||
    message.length > 20_000 ||
    subject.length > 500 ||
    writingStyle.length > 500
  ) {
    return json({ success: false, error: "Le message ou l'action est invalide." }, 400);
  }

  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      max_tokens: 2_000,
      messages: [
        {
          role: "system",
          content: [
            "Tu améliores un brouillon d'email en français.",
            ACTION_INSTRUCTIONS[action],
            "Ne change aucun nom, montant, date, destinataire ou engagement.",
            "Ne crée pas de signature et retourne uniquement le brouillon modifiable.",
            UNTRUSTED_EMAIL_RULE,
          ]
            .filter(Boolean)
            .join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            subject,
            body: message,
            preferredWritingStyle: writingStyle,
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "improved_email_draft",
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
    const result = content
      ? (JSON.parse(content) as { subject?: unknown; body?: unknown })
      : null;
    if (
      typeof result?.subject !== "string" ||
      result.subject.length > 500 ||
      typeof result.body !== "string" ||
      !result.body.trim() ||
      result.body.length > 20_000
    ) {
      return json({ success: false, error: "Groq a retourné un brouillon invalide." }, 502);
    }
    return json({
      success: true,
      data: {
        subject: result.subject,
        body: result.body,
        model: completion.model,
      },
    });
  } catch (error) {
    console.error("Échec de l'amélioration du brouillon Groq.", error);
    return json({ success: false, error: "Le brouillon ne peut pas être amélioré pour le moment." }, 502);
  }
}
