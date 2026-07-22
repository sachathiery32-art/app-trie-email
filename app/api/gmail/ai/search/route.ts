import { NextResponse, type NextRequest } from "next/server";

import { AI_INPUT_LIMITS, GROQ_MODEL, UNTRUSTED_EMAIL_RULE } from "@/lib/ai-config";
import { aiRequestError } from "@/lib/ai-route";
import { searchGmailMessages } from "@/lib/gmail";
import { gmailErrorResponse } from "@/lib/gmail-route";
import { getGoogleAccessToken } from "@/lib/google-session";
import { groq } from "@/lib/groq";
import type { GmailAiSearchResponse } from "@/types/ai";

export const dynamic = "force-dynamic";

function json(payload: GmailAiSearchResponse, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function jsonSchema(name: string, property: string) {
  return {
    type: "json_schema" as const,
    json_schema: {
      name,
      strict: true,
      schema: {
        type: "object",
        properties: { [property]: { type: "string" } },
        required: [property],
        additionalProperties: false,
      },
    },
  };
}

export async function POST(request: NextRequest) {
  const requestError = await aiRequestError(request);
  if (requestError) return requestError;

  const value: unknown = await request.json().catch(() => null);
  const question =
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).question === "string"
      ? (value as Record<string, string>).question.trim()
      : "";
  if (!question || question.length > 500) {
    return json(
      { success: false, error: "Posez une question de 500 caractères maximum." },
      400,
    );
  }

  try {
    const accessToken = await getGoogleAccessToken(request);
    const queryCompletion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content: [
            "Transforme la question française en une requête de recherche Gmail concise.",
            "Utilise uniquement la syntaxe Gmail, sans explication.",
            `La date actuelle est ${new Date().toISOString().slice(0, 10)}.`,
            "Ne cherche jamais dans le spam ni la corbeille.",
          ].join(" "),
        },
        { role: "user", content: question },
      ],
      response_format: jsonSchema("gmail_search_query", "gmailQuery"),
    });
    const queryContent = queryCompletion.choices[0]?.message.content;
    const queryObject = queryContent
      ? (JSON.parse(queryContent) as { gmailQuery?: unknown })
      : null;
    const modelQuery =
      typeof queryObject?.gmailQuery === "string"
        ? queryObject.gmailQuery.trim().slice(0, 450)
        : "";
    if (!modelQuery) {
      return json(
        { success: false, error: "La question n'a pas pu être convertie en recherche Gmail." },
        502,
      );
    }
    // La recherche intelligente ne doit jamais élargir silencieusement son
    // périmètre au spam ou à la corbeille, même si la question le demande.
    const gmailQuery = `${modelQuery.replace(/\bin:anywhere\b/gi, "").trim()} -in:spam -in:trash`
      .trim()
      .slice(0, 500);

    const messages = await searchGmailMessages(
      accessToken,
      gmailQuery,
      AI_INPUT_LIMITS.searchMessages,
    );
    const sources = messages.map((message) => ({
      messageId: message.id,
      sender: message.senderEmail,
      subject: message.subject,
      receivedAt: message.receivedAt,
    }));
    if (messages.length === 0) {
      return json({
        success: true,
        data: {
          answer: "Aucun email correspondant n'a été trouvé dans Gmail.",
          gmailQuery,
          sources,
          model: queryCompletion.model,
        },
      });
    }

    const answerCompletion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      max_tokens: 1_200,
      messages: [
        {
          role: "system",
          content: [
            "Réponds en français uniquement à partir des emails fournis.",
            "Cite les sources sous la forme [1], [2].",
            "Dis clairement lorsque l'information manque ou est incertaine.",
            "Ne révèle pas plus de données personnelles que nécessaire.",
            UNTRUSTED_EMAIL_RULE,
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            question,
            emails: messages.map((message, index) => ({
              source: index + 1,
              sender: message.senderEmail,
              subject: message.subject,
              date: new Date(message.receivedAt).toISOString(),
              content: message.bodyText.slice(0, 10_000),
            })),
          }),
        },
      ],
      response_format: jsonSchema("gmail_search_answer", "answer"),
    });
    const answerContent = answerCompletion.choices[0]?.message.content;
    const answerObject = answerContent
      ? (JSON.parse(answerContent) as { answer?: unknown })
      : null;
    if (typeof answerObject?.answer !== "string" || !answerObject.answer.trim()) {
      return json({ success: false, error: "Groq n'a pas produit de réponse exploitable." }, 502);
    }
    return json({
      success: true,
      data: {
        answer: answerObject.answer.trim(),
        gmailQuery,
        sources,
        model: answerCompletion.model,
      },
    });
  } catch (error) {
    console.error("Échec de la recherche IA Gmail.", error);
    return gmailErrorResponse(error);
  }
}
