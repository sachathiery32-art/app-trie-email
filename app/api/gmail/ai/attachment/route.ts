import { NextResponse, type NextRequest } from "next/server";

import { AI_INPUT_LIMITS, GROQ_MODEL, UNTRUSTED_EMAIL_RULE } from "@/lib/ai-config";
import { aiRequestError } from "@/lib/ai-route";
import { downloadGmailAttachment } from "@/lib/gmail";
import { gmailErrorResponse } from "@/lib/gmail-route";
import { getGoogleAccessToken } from "@/lib/google-session";
import { groq } from "@/lib/groq";
import type { GmailAttachmentAnalysisResponse } from "@/types/ai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,512}$/;
const TEXT_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/csv",
  "application/rtf",
  "application/x-ndjson",
]);

function json(payload: GmailAttachmentAnalysisResponse, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function extractText(
  data: Buffer,
  filename: string,
  mimeType: string,
) {
  const isPdf =
    mimeType === "application/pdf" || filename.toLocaleLowerCase("fr-FR").endsWith(".pdf");
  if (isPdf) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(data) });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }

  if (
    mimeType.startsWith("text/") ||
    TEXT_MIME_TYPES.has(mimeType) ||
    /\.(txt|csv|json|xml|md|rtf|log)$/i.test(filename)
  ) {
    return data.toString("utf8");
  }
  return null;
}

export async function POST(request: NextRequest) {
  const requestError = await aiRequestError(request);
  if (requestError) return requestError;

  const value: unknown = await request.json().catch(() => null);
  if (typeof value !== "object" || value === null) {
    return json({ success: false, error: "La pièce jointe est invalide." }, 400);
  }
  const body = value as Record<string, unknown>;
  const messageId = typeof body.messageId === "string" ? body.messageId : "";
  const attachmentId =
    typeof body.attachmentId === "string" ? body.attachmentId : "";
  const filename = typeof body.filename === "string" ? body.filename.trim() : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType.trim() : "";
  if (
    !ID_PATTERN.test(messageId) ||
    !ID_PATTERN.test(attachmentId) ||
    !filename ||
    filename.length > 180 ||
    mimeType.length > 200
  ) {
    return json({ success: false, error: "La pièce jointe est invalide." }, 400);
  }

  try {
    const accessToken = await getGoogleAccessToken(request);
    const data = await downloadGmailAttachment(accessToken, messageId, attachmentId);
    const extractedText = await extractText(data, filename, mimeType);
    if (!extractedText?.trim()) {
      return json(
        {
          success: false,
          error:
            "Ce format ne contient pas de texte exploitable. Utilisez un PDF texte, TXT, CSV, JSON ou XML.",
        },
        415,
      );
    }

    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      max_tokens: 1_800,
      messages: [
        {
          role: "system",
          content: [
            "Analyse ce document joint en français.",
            "Extrais uniquement les faits présents, les dates, les montants, les actions et les avertissements utiles.",
            "N'invente rien et précise dans warnings si le texte semble incomplet.",
            UNTRUSTED_EMAIL_RULE,
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            filename,
            mimeType,
            content: extractedText.slice(0, AI_INPUT_LIMITS.attachmentCharacters),
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "gmail_attachment_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              summary: { type: "string" },
              documentType: { type: "string" },
              keyFacts: { type: "array", maxItems: 12, items: { type: "string" } },
              dates: { type: "array", maxItems: 10, items: { type: "string" } },
              amounts: { type: "array", maxItems: 10, items: { type: "string" } },
              actionItems: { type: "array", maxItems: 10, items: { type: "string" } },
              warnings: { type: "array", maxItems: 8, items: { type: "string" } },
            },
            required: [
              "summary",
              "documentType",
              "keyFacts",
              "dates",
              "amounts",
              "actionItems",
              "warnings",
            ],
            additionalProperties: false,
          },
        },
      },
    });
    const content = completion.choices[0]?.message.content;
    const result = content ? (JSON.parse(content) as Record<string, unknown>) : null;
    if (
      !result ||
      typeof result.summary !== "string" ||
      typeof result.documentType !== "string" ||
      !["keyFacts", "dates", "amounts", "actionItems", "warnings"].every(
        (key) =>
          Array.isArray(result[key]) &&
          (result[key] as unknown[]).every((item) => typeof item === "string"),
      )
    ) {
      return json({ success: false, error: "Groq a retourné une analyse incomplète." }, 502);
    }
    return json({
      success: true,
      data: {
        summary: result.summary,
        documentType: result.documentType,
        keyFacts: result.keyFacts as string[],
        dates: result.dates as string[],
        amounts: result.amounts as string[],
        actionItems: result.actionItems as string[],
        warnings: result.warnings as string[],
        model: completion.model,
      },
    });
  } catch (error) {
    console.error("Échec de l'analyse de pièce jointe.", error);
    return gmailErrorResponse(error);
  }
}
