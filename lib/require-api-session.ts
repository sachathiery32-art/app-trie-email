import "server-only";

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { isGoogleAuthConfigured } from "@/lib/auth-config";
import type { ApiErrorResponse } from "@/types/api";

/**
 * Protège les routes qui consomment des ressources serveur ou appellent Groq.
 * Retourne `null` seulement lorsqu'une session Google valide est présente.
 */
export async function requireApiSession() {
  if (!isGoogleAuthConfigured()) {
    return NextResponse.json<ApiErrorResponse>(
      {
        success: false,
        error: "L'authentification Google doit être configurée sur le serveur.",
      },
      { status: 503 },
    );
  }

  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json<ApiErrorResponse>(
      {
        success: false,
        error: "Vous devez vous connecter avec Google pour continuer.",
      },
      { status: 401 },
    );
  }

  return null;
}
