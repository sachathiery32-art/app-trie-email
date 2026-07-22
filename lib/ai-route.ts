import { NextResponse, type NextRequest } from "next/server";

import { checkAiRateLimit } from "@/lib/ai-rate-limit";
import { aiSessionError } from "@/lib/ai-session";
import type { ApiErrorResponse } from "@/types/api";

/** Authentification et quota communs à toutes les fonctions IA. */
export async function aiRequestError(request: NextRequest) {
  const sessionError = await aiSessionError(request);
  if (sessionError) return sessionError;

  const rateLimit = checkAiRateLimit(request);
  if (rateLimit.allowed) return null;

  return NextResponse.json<ApiErrorResponse>(
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
