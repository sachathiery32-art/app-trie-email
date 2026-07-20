import { NextResponse } from "next/server";

import { groq } from "@/lib/groq";
import { requireApiSession } from "@/lib/require-api-session";
import type { GroqTestResponse } from "@/types/groq";

/**
 * Vérifie la connexion entre le serveur Next.js et Groq.
 * Le navigateur appelle cette route, mais seul le serveur communique avec Groq.
 */
export async function GET() {
  const authenticationError = await requireApiSession();

  if (authenticationError) {
    return authenticationError;
  }

  try {
    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      messages: [
        {
          role: "user",
          content:
            "Réponds en une phrase courte pour souhaiter la bienvenue dans Email Organizer AI.",
        },
      ],
    });

    const message = completion.choices[0]?.message.content?.trim();

    // Une réponse sans texte est valide techniquement, mais inutile pour ce test.
    if (!message) {
      return NextResponse.json<GroqTestResponse>(
        {
          success: false,
          error: "Groq a répondu sans retourner de texte.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json<GroqTestResponse>({
      success: true,
      data: {
        message,
        model: completion.model,
      },
    });
  } catch (error) {
    // Le détail reste dans les logs serveur et n'est pas exposé au navigateur.
    console.error("Échec de l'appel à Groq :", error);

    return NextResponse.json<GroqTestResponse>(
      {
        success: false,
        error: "Impossible de contacter Groq pour le moment.",
      },
      { status: 502 },
    );
  }
}
