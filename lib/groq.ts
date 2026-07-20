import "server-only";

import OpenAI from "openai";

const apiKey = process.env.GROQ_API_KEY;

if (!apiKey) {
  throw new Error(
    "La variable d'environnement GROQ_API_KEY est manquante dans .env.local.",
  );
}

/**
 * Client Groq unique de l'application.
 *
 * Groq expose une API compatible avec le SDK OpenAI : seul le baseURL change.
 * Ce module est réservé au serveur afin de ne jamais exposer la clé au navigateur.
 */
export const groq = new OpenAI({
  apiKey,
  baseURL: "https://api.groq.com/openai/v1",
});
