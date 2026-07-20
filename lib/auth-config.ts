import "server-only";

const REQUIRED_GOOGLE_AUTH_VARIABLES = [
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "AUTH_SECRET",
] as const;

/** Évite une erreur serveur tant que les identifiants OAuth ne sont pas créés. */
export function isGoogleAuthConfigured() {
  return REQUIRED_GOOGLE_AUTH_VARIABLES.every(
    (variableName) => Boolean(process.env[variableName]?.trim()),
  );
}
