import "server-only";

import OpenAI from "openai";

const apiKey = process.env.XKIRO_API_KEY?.trim();

if (!apiKey) {
  throw new Error(
    "La variable d'environnement XKIRO_API_KEY est manquante côté serveur.",
  );
}

/**
 * Client xKiro unique de l'application.
 *
 * xKiro expose une API compatible avec le SDK OpenAI : seul le baseURL change.
 * Ce module est réservé au serveur afin de ne jamais exposer la clé au navigateur.
 */
export const xkiro = new OpenAI({
  apiKey,
  baseURL: "https://api.xkiro.com/v1",
  timeout: 120_000,
  maxRetries: 2,
});
