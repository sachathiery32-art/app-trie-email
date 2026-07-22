type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
};

export type RefreshedGoogleTokens = {
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
};

/**
 * Échange un refresh token contre un nouveau jeton d'accès Google.
 * Les identifiants OAuth ne quittent jamais le serveur.
 */
export async function refreshGoogleAccessToken(
  refreshToken: string,
): Promise<RefreshedGoogleTokens> {
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Configuration OAuth Google incomplète.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    // Le corps Google peut contenir des détails sensibles : il n'est pas journalisé.
    throw new Error("Google a refusé le renouvellement de la connexion.");
  }

  const tokens = (await response.json()) as Partial<GoogleTokenResponse>;

  if (!tokens.access_token || typeof tokens.expires_in !== "number") {
    throw new Error("Réponse OAuth Google incomplète.");
  }

  return {
    accessToken: tokens.access_token,
    expiresAt: Math.floor(Date.now() / 1000 + tokens.expires_in),
    refreshToken: tokens.refresh_token,
  };
}
