"use client";

import { useState, type FormEvent } from "react";

import { EMAIL_CATEGORY_LABELS } from "@/lib/email-categories";
import type {
  ClassifyEmailRequest,
  ClassifyEmailResponse,
} from "@/types/email";

const INITIAL_EMAIL: ClassifyEmailRequest = {
  sender: "offers@productivity-app.example",
  subject: "Profitez de 30 % de réduction cette semaine",
  body: "Bonjour Sacha, découvrez notre offre spéciale : économisez 30 % sur votre abonnement annuel jusqu'à dimanche soir.",
};

type ClassificationState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "success";
      data: Extract<ClassifyEmailResponse, { success: true }>["data"];
    }
  | { status: "error"; message: string };

export function EmailClassificationForm() {
  const [email, setEmail] = useState<ClassifyEmailRequest>(INITIAL_EMAIL);
  const [classificationState, setClassificationState] =
    useState<ClassificationState>({ status: "idle" });

  function updateField(field: keyof ClassifyEmailRequest, value: string) {
    setEmail((currentEmail) => ({ ...currentEmail, [field]: value }));
  }

  async function classifyEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setClassificationState({ status: "loading" });

    try {
      const response = await fetch("/api/classify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(email),
      });

      const payload = (await response.json()) as ClassifyEmailResponse;

      if (!response.ok || !payload.success) {
        const message = payload.success
          ? "La route API a retourné une erreur inattendue."
          : payload.error;

        throw new Error(message);
      }

      setClassificationState({ status: "success", data: payload.data });
    } catch (error) {
      setClassificationState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Une erreur inconnue est survenue.",
      });
    }
  }

  const isLoading = classificationState.status === "loading";

  return (
    <div className="mt-10 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
      <form
        onSubmit={classifyEmail}
        className="border border-neutral-200 bg-white p-5 sm:p-7"
      >
        <div className="grid gap-5">
          <div>
            <label
              htmlFor="email-sender"
              className="text-sm font-semibold text-neutral-900"
            >
              Expéditeur
            </label>
            <input
              id="email-sender"
              type="text"
              required
              maxLength={320}
              value={email.sender}
              onChange={(event) => updateField("sender", event.target.value)}
              className="mt-2 min-h-12 w-full border border-neutral-300 bg-white px-4 text-base text-neutral-950 outline-none transition-colors duration-200 placeholder:text-neutral-400 focus:border-neutral-950 focus:ring-1 focus:ring-neutral-950"
              placeholder="contact@entreprise.com"
            />
          </div>

          <div>
            <label
              htmlFor="email-subject"
              className="text-sm font-semibold text-neutral-900"
            >
              Objet
            </label>
            <input
              id="email-subject"
              type="text"
              maxLength={500}
              value={email.subject}
              onChange={(event) => updateField("subject", event.target.value)}
              className="mt-2 min-h-12 w-full border border-neutral-300 bg-white px-4 text-base text-neutral-950 outline-none transition-colors duration-200 placeholder:text-neutral-400 focus:border-neutral-950 focus:ring-1 focus:ring-neutral-950"
              placeholder="Objet de l'email"
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-4">
              <label
                htmlFor="email-body"
                className="text-sm font-semibold text-neutral-900"
              >
                Contenu
              </label>
              <span className="text-xs text-neutral-500">
                {email.body.length.toLocaleString("fr-FR")} / 20 000
              </span>
            </div>
            <textarea
              id="email-body"
              required
              rows={7}
              maxLength={20_000}
              value={email.body}
              onChange={(event) => updateField("body", event.target.value)}
              className="mt-2 w-full resize-y border border-neutral-300 bg-white px-4 py-3 text-base leading-7 text-neutral-950 outline-none transition-colors duration-200 placeholder:text-neutral-400 focus:border-neutral-950 focus:ring-1 focus:ring-neutral-950"
              placeholder="Collez ici le contenu d'un email fictif."
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="mt-6 flex min-h-12 w-full cursor-pointer items-center justify-center bg-[#d4af37] px-5 py-3 font-semibold text-neutral-950 transition-colors duration-200 hover:bg-[#c39d27] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-600"
        >
          {isLoading ? "Classification en cours…" : "Classifier l'email"}
        </button>

        <p className="mt-3 text-center text-xs leading-5 text-neutral-500">
          Utilisez uniquement des emails fictifs pour cette démonstration.
        </p>
      </form>

      <div
        aria-live="polite"
        aria-busy={isLoading}
        className="flex min-h-80 border border-neutral-200 bg-[#fafaf8] p-5 sm:p-7"
      >
        {classificationState.status === "idle" && (
          <div className="m-auto max-w-sm text-center">
            <div className="mx-auto flex size-12 items-center justify-center bg-[#f5e8b9] text-neutral-900">
              <svg
                aria-hidden="true"
                className="size-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.568 3.75H6.75A3.75 3.75 0 0 0 3 7.5v9a3.75 3.75 0 0 0 3.75 3.75h10.5A3.75 3.75 0 0 0 21 16.5v-6.068a3 3 0 0 0-.879-2.121l-3.432-3.432A3 3 0 0 0 14.568 4H12m-2.432-.25v4.5h4.5"
                />
              </svg>
            </div>
            <h3 className="mt-5 text-lg font-semibold text-neutral-950">
              Résultat de la classification
            </h3>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              Modifiez l’exemple si vous le souhaitez, puis lancez la
              classification.
            </p>
          </div>
        )}

        {classificationState.status === "loading" && (
          <div className="m-auto flex items-center gap-3 text-neutral-700">
            <span
              aria-hidden="true"
              className="size-5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900 motion-reduce:animate-none"
            />
            <span className="font-medium">Analyse de l’email par Groq…</span>
          </div>
        )}

        {classificationState.status === "success" && (
          <div className="my-auto w-full">
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
              <p className="font-semibold">Email classifié</p>
            </div>

            <p className="mt-7 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
              Catégorie
            </p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
              {EMAIL_CATEGORY_LABELS[classificationState.data.category]}
            </p>
            <code className="mt-2 inline-block bg-neutral-200 px-2 py-1 font-mono text-xs text-neutral-700">
              {classificationState.data.category}
            </code>

            <p className="mt-7 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
              Pourquoi ?
            </p>
            <p className="mt-2 text-sm leading-6 text-neutral-700">
              {classificationState.data.reason}
            </p>

            <p className="mt-7 border-t border-neutral-200 pt-4 text-xs text-neutral-500">
              Modèle :{" "}
              <code className="font-mono text-neutral-700">
                {classificationState.data.model}
              </code>
            </p>
          </div>
        )}

        {classificationState.status === "error" && (
          <div role="alert" className="my-auto">
            <p className="font-semibold text-red-800">
              La classification a échoué
            </p>
            <p className="mt-2 text-sm leading-6 text-neutral-700">
              {classificationState.message}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
