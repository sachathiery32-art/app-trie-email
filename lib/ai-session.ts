import { NextResponse, type NextRequest } from "next/server";

import {
  GoogleSessionError,
  requireGoogleUser,
} from "@/lib/google-session";
import type { ApiErrorResponse } from "@/types/api";

/**
 * Ferme les routes xKiro aux visiteurs anonymes et aux comptes absents de la
 * liste blanche, sans exposer les jetons Google au navigateur.
 */
export async function aiSessionError(request: NextRequest) {
  try {
    await requireGoogleUser(request);
    return null;
  } catch (error) {
    if (error instanceof GoogleSessionError) {
      return NextResponse.json<ApiErrorResponse>(
        {
          success: false,
          error:
            error.code === "UNAUTHENTICATED"
              ? "Connectez-vous avec Google pour utiliser les fonctions IA."
              : "Ce compte Google n'est pas autorisé.",
        },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 },
      );
    }

    return NextResponse.json<ApiErrorResponse>(
      {
        success: false,
        error: "La session ne peut pas être vérifiée pour le moment.",
      },
      { status: 500 },
    );
  }
}
