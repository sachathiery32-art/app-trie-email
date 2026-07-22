import { NextResponse } from "next/server";

import { GmailApiError } from "@/lib/gmail";
import { GoogleSessionError } from "@/lib/google-session";
import type { GmailApiErrorResponse } from "@/types/gmail";

function json(payload: GmailApiErrorResponse, status: number) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

/** Traduit les erreurs d'authentification et de Gmail de façon uniforme. */
export function gmailErrorResponse(error: unknown) {
  if (error instanceof GoogleSessionError) {
    const messages = {
      UNAUTHENTICATED: "Connectez-vous avec Google pour afficher Gmail.",
      FORBIDDEN: "Ce compte Google n'est pas autorisé.",
      RECONNECT_REQUIRED:
        "Reconnectez Google afin d'autoriser la lecture des emails.",
    } as const;

    return json(
      { success: false, code: error.code, error: messages[error.code] },
      error.code === "UNAUTHENTICATED" ? 401 : 403,
    );
  }

  if (error instanceof GmailApiError) {
    return json(
      {
        success: false,
        code: error.status === 401 ? "RECONNECT_REQUIRED" : "GMAIL_ERROR",
        error:
          error.status === 401
            ? "La connexion Google doit être renouvelée."
            : "Gmail ne peut pas être chargé pour le moment.",
      },
      error.status === 401 ? 403 : 502,
    );
  }

  return json(
    {
      success: false,
      code: "GMAIL_ERROR",
      error: "Une erreur inattendue empêche le chargement de Gmail.",
    },
    500,
  );
}
