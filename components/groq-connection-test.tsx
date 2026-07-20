"use client";

import { useState } from "react";

import type { GroqTestResponse } from "@/types/groq";

type RequestState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "success";
      data: Extract<GroqTestResponse, { success: true }>["data"];
    }
  | { status: "error"; message: string };

export function GroqConnectionTest() {
  const [requestState, setRequestState] = useState<RequestState>({
    status: "idle",
  });

  async function testConnection() {
    setRequestState({ status: "loading" });

    try {
      const response = await fetch("/api/test", { cache: "no-store" });
      const payload = (await response.json()) as GroqTestResponse;

      if (!response.ok || !payload.success) {
        const message = payload.success
          ? "La route API a retourné une erreur inattendue."
          : payload.error;

        throw new Error(message);
      }

      setRequestState({ status: "success", data: payload.data });
    } catch (error) {
      setRequestState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Une erreur inconnue est survenue.",
      });
    }
  }

  const isLoading = requestState.status === "loading";

  return (
    <section
      aria-labelledby="connection-test-title"
      className="border border-neutral-200 bg-white p-5 sm:p-7"
    >
      <div className="flex items-start gap-4">
        <div className="flex size-11 shrink-0 items-center justify-center bg-[#f5e8b9] text-neutral-900">
          <svg
            aria-hidden="true"
            className="size-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.75 3.75 8.1 8.7l-4.35 1.8 4.35 1.8 1.65 4.95 1.65-4.95 4.35-1.8-4.35-1.8-1.65-4.95Zm7.5 10.5-.9 2.7-2.35.98 2.35.97.9 2.7.9-2.7 2.35-.97-2.35-.98-.9-2.7Z"
            />
          </svg>
        </div>

        <div>
          <p className="text-sm font-medium text-neutral-500">Test en direct</p>
          <h2
            id="connection-test-title"
            className="mt-1 text-xl font-semibold tracking-tight text-neutral-950"
          >
            Connexion à Groq
          </h2>
        </div>
      </div>

      <div
        aria-live="polite"
        aria-busy={isLoading}
        className="mt-6 flex min-h-40 items-center border border-neutral-200 bg-[#fafaf8] p-5"
      >
        {requestState.status === "idle" && (
          <div>
            <p className="font-medium text-neutral-900">Prêt pour le test</p>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              Le bouton appellera votre route Next.js, jamais Groq directement
              depuis le navigateur.
            </p>
          </div>
        )}

        {requestState.status === "loading" && (
          <div className="flex items-center gap-3 text-neutral-700">
            <span
              aria-hidden="true"
              className="size-5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900 motion-reduce:animate-none"
            />
            <span className="font-medium">Connexion à Groq en cours…</span>
          </div>
        )}

        {requestState.status === "success" && (
          <div className="w-full">
            <div className="flex items-center gap-2 text-emerald-800">
              <svg
                aria-hidden="true"
                className="size-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m5 12 4 4L19 6"
                />
              </svg>
              <p className="font-semibold">Connexion réussie</p>
            </div>
            <p className="mt-3 text-sm leading-6 text-neutral-700">
              {requestState.data.message}
            </p>
            <p className="mt-4 border-t border-neutral-200 pt-3 text-xs text-neutral-500">
              Modèle :{" "}
              <code className="font-mono text-neutral-700">
                {requestState.data.model}
              </code>
            </p>
          </div>
        )}

        {requestState.status === "error" && (
          <div role="alert">
            <p className="font-semibold text-red-800">Le test a échoué</p>
            <p className="mt-2 text-sm leading-6 text-neutral-700">
              {requestState.message}
            </p>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={testConnection}
        disabled={isLoading}
        className="mt-5 flex min-h-12 w-full cursor-pointer items-center justify-center bg-[#d4af37] px-5 py-3 font-semibold text-neutral-950 transition-colors duration-200 hover:bg-[#c39d27] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-600"
      >
        {isLoading ? "Test en cours…" : "Tester la connexion Groq"}
      </button>

      <p className="mt-3 text-center text-xs leading-5 text-neutral-500">
        Votre clé API reste protégée sur le serveur.
      </p>
    </section>
  );
}
