import { NextResponse, type NextRequest } from "next/server";

import {
  GoogleSessionError,
  requireAllowedGoogleUser,
} from "@/lib/google-session";
import type { ApiErrorResponse } from "@/types/api";

/**
 * Ferme les routes Groq aux visiteurs anonymes et aux comptes qui ne figurent
 * pas dans la liste blanche, sans exposer les jetons Google au navigateur.
 */
export async function aiSessionError(request: NextRequest) {
  try {
    await requireAllowedGoogleUser(request);
    return null;
  } catch (error) {
    if (error instanceof GoogleSessionError) {
      return NextResponse.json<ApiErrorResponse>(
        {
          success: false,
          error:
            error.code === "UNAUTHENTICATED"
              ? "Connectez-vous avec le compte Google autorisé."
              : "Cette session Google n'est pas autorisée.",
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
