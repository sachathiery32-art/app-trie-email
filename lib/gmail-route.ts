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
export function gmailErrorResponse(
  error: unknown,
  operation: "read" | "send" | "modify" = "read",
) {
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
    const isAttachmentTooLarge = error.status === 413;
    return json(
      {
        success: false,
        code: error.status === 401 ? "RECONNECT_REQUIRED" : "GMAIL_ERROR",
        error:
          error.status === 401
            ? "La connexion Google doit être renouvelée."
            : isAttachmentTooLarge
              ? "Cette pièce jointe dépasse la limite de téléchargement de 3 Mo de l'hébergement actuel."
            : operation === "send"
              ? "Gmail n'a pas pu envoyer ce message. Aucun nouvel essai automatique n'a été effectué."
              : operation === "modify"
                ? "Gmail n'a pas pu appliquer cette action."
                : "Gmail ne peut pas être chargé pour le moment.",
      },
      error.status === 401 ? 403 : isAttachmentTooLarge ? 413 : 502,
    );
  }

  return json(
    {
      success: false,
      code: "GMAIL_ERROR",
      error:
        operation === "send"
          ? "Une erreur inattendue a empêché l'envoi du message."
          : operation === "modify"
            ? "Une erreur inattendue a empêché la modification de Gmail."
            : "Une erreur inattendue empêche le chargement de Gmail.",
    },
    500,
  );
}
