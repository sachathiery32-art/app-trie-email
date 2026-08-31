import "server-only";

import { NextResponse } from "next/server";

import type { ApiErrorResponse } from "@/types/api";

function apiStatus(error: unknown) {
  if (typeof error !== "object" || error === null || !("status" in error)) return 0;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : 0;
}

function retryAfter(error: unknown) {
  if (typeof error !== "object" || error === null || !("headers" in error)) return "20";
  const headers = (error as { headers?: { get?: (name: string) => string | null } }).headers;
  return headers?.get?.("retry-after") ?? "20";
}

/** Traduit une erreur xKiro sans la présenter à tort comme une erreur Gmail. */
export function xkiroErrorResponse(error: unknown, operation: "search" | "triage") {
  const status = apiStatus(error);
  const isRateLimit = status === 429;
  const isConfigurationError = status === 401 || status === 403;
  const message = isRateLimit
    ? "xKiro reçoit trop de données à la fois. Le traitement reprendra automatiquement après une courte pause."
    : isConfigurationError
      ? "La connexion à xKiro doit être vérifiée par l’administrateur."
      : operation === "search"
        ? "L’assistant n’a pas pu analyser Gmail pour le moment. Réessayez dans quelques instants."
        : "xKiro n’a pas pu terminer ce lot de classement. Les autres lots ne sont pas modifiés.";

  return NextResponse.json<ApiErrorResponse>(
    { success: false, error: message },
    {
      status: isRateLimit ? 429 : isConfigurationError ? 503 : 502,
      headers: {
        "Cache-Control": "private, no-store",
        ...(isRateLimit ? { "Retry-After": retryAfter(error) } : {}),
      },
    },
  );
}
