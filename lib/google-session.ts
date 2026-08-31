import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import { unstable_update } from "@/auth";
import { refreshGoogleAccessToken } from "@/lib/google-oauth";
import { persistGoogleRefreshToken } from "@/lib/mail-store";

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

async function getGoogleToken(request: NextRequest) {
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
  if (
    !allowedEmail ||
    token.email.trim().toLocaleLowerCase("en-US") !== allowedEmail
  ) {
    throw new GoogleSessionError("FORBIDDEN");
  }

  return token;
}

/** Vérifie la session et la liste blanche avant de retourner l'identité Google. */
export async function requireGoogleUser(request: NextRequest) {
  const token = await getGoogleToken(request);
  return (token.email as string).trim().toLocaleLowerCase("en-US");
}

/**
 * Déchiffre le JWT Auth.js côté serveur et retourne un jeton Gmail valide.
 * Le refresh token n'est jamais ajouté à la réponse HTTP de l'application.
 */
export async function getGoogleAccessToken(request: NextRequest) {
  const token = await getGoogleToken(request);

  const expiresAt = token.googleAccessTokenExpiresAt;
  const hasValidAccessToken =
    token.googleAccessToken &&
    typeof expiresAt === "number" &&
    Date.now() < (expiresAt - 60) * 1000;

  if (hasValidAccessToken) {
    if (token.googleRefreshToken) {
      void persistGoogleRefreshToken(token.email as string, token.googleRefreshToken).catch(
        (error) => console.error("Persistance OAuth différée impossible.", error),
      );
    }
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

    await persistGoogleRefreshToken(
      token.email as string,
      refreshedTokens.refreshToken ?? token.googleRefreshToken,
    ).catch((error) => console.error("Persistance OAuth différée impossible.", error));

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
