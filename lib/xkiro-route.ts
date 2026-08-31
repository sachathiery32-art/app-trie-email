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
  const isConfigurationError =
    status === 401 || status === 402 || status === 403 || status === 404;
  const message =
    status === 401
      ? "La clé XKIRO_API_KEY est invalide ou révoquée. Créez une nouvelle clé xKiro, remplacez-la dans Vercel, puis redéployez."
      : status === 402
        ? "Le crédit ou le quota xKiro est épuisé. Vérifiez le solde du compte xKiro."
        : status === 403
          ? "Cette clé xKiro n’est pas autorisée à utiliser Qwen3.8 Max. Activez l’accès à ce modèle dans votre compte xKiro."
          : status === 404
            ? "Le modèle Qwen3.8 Max n’est pas disponible avec la configuration xKiro actuelle."
            : isRateLimit
              ? "xKiro reçoit trop de données à la fois. Le traitement reprendra automatiquement après une courte pause."
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
