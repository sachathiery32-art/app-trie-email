import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import { unstable_update } from "@/auth";
import { refreshGoogleAccessToken } from "@/lib/google-oauth";

export type GoogleSessionErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "RECONNECT_REQUIRED";

export class GoogleSessionError extends Error {
  constructor(public readonly code: GoogleSessionErrorCode) {
    super(code);
    this.name = "GoogleSessionError";
  }
}

function usesSecureCookie(request: NextRequest) {
  return (
    request.nextUrl.protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https"
  );
}

async function getAllowedGoogleToken(request: NextRequest) {
  const secret = process.env.AUTH_SECRET;

  if (!secret) {
    throw new GoogleSessionError("RECONNECT_REQUIRED");
  }

  const token = await getToken({
    req: request,
    secret,
    secureCookie: usesSecureCookie(request),
  });

  if (!token?.email) {
    throw new GoogleSessionError("UNAUTHENTICATED");
  }

  const allowedEmail = process.env.ALLOWED_GOOGLE_EMAIL
    ?.trim()
    .toLocaleLowerCase("en-US");

  if (!allowedEmail || token.email.toLocaleLowerCase("en-US") !== allowedEmail) {
    throw new GoogleSessionError("FORBIDDEN");
  }

  return token;
}

/** Vérifie la session et la liste blanche sans demander un accès à Gmail. */
export async function requireAllowedGoogleUser(request: NextRequest) {
  await getAllowedGoogleToken(request);
}

/**
 * Déchiffre le JWT Auth.js côté serveur et retourne un jeton Gmail valide.
 * Le refresh token n'est jamais ajouté à la réponse HTTP de l'application.
 */
export async function getGoogleAccessToken(request: NextRequest) {
  const token = await getAllowedGoogleToken(request);

  const expiresAt = token.googleAccessTokenExpiresAt;
  const hasValidAccessToken =
    token.googleAccessToken &&
    typeof expiresAt === "number" &&
    Date.now() < (expiresAt - 60) * 1000;

  if (hasValidAccessToken) {
    return token.googleAccessToken as string;
  }

  if (!token.googleRefreshToken) {
    // Une session créée avant l'ajout de Gmail doit repasser par le consentement.
    throw new GoogleSessionError("RECONNECT_REQUIRED");
  }

  try {
    const refreshedTokens = await refreshGoogleAccessToken(
      token.googleRefreshToken,
    );

    await unstable_update({
      _googleTokenUpdate: {
        accessToken: refreshedTokens.accessToken,
        expiresAt: refreshedTokens.expiresAt,
        refreshToken:
          refreshedTokens.refreshToken ?? token.googleRefreshToken,
      },
    });

    return refreshedTokens.accessToken;
  } catch {
    throw new GoogleSessionError("RECONNECT_REQUIRED");
  }
}
