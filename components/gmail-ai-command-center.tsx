"use client";

import { useState, type FormEvent } from "react";

import { MailboxIcon } from "@/components/mailbox-icon";
import {
  AI_CATEGORY_LABELS,
  AI_PRIORITY_LABELS,
  type AiUserPreferences,
  type GmailAiSearchResponse,
  type GmailAiTriageItem,
} from "@/types/ai";
import type { GmailMessageSummary } from "@/types/gmail";

type Props = {
  messages: GmailMessageSummary[];
  isTriageRunning: boolean;
  onTriage: (messageIds: string[]) => Promise<GmailAiTriageItem[]>;
  onApplyGmailQuery: (query: string) => void;
  preferences: AiUserPreferences;
  onPreferencesChange: (preferences: AiUserPreferences) => void;
};

export function GmailAiCommandCenter({
  messages,
  isTriageRunning,
  onTriage,
  onApplyGmailQuery,
  preferences,
  onPreferencesChange,
}: Props) {
  const [question, setQuestion] = useState("");
  const [searchState, setSearchState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | {
        status: "success";
        answer: string;
        gmailQuery: string;
        sources: Array<{
          messageId: string;
          sender: string;
          subject: string;
          receivedAt: number;
        }>;
      }
    | { status: "error"; message: string }
  >({ status: "idle" });
  const [confirmTriage, setConfirmTriage] = useState(false);
  const [triageState, setTriageState] = useState<
    | { status: "idle" }
    | { status: "success"; items: GmailAiTriageItem[] }
    | { status: "error"; message: string }
  >({ status: "idle" });

  async function askMailbox(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanQuestion = question.trim();
    if (!cleanQuestion || searchState.status === "loading") return;
    setSearchState({ status: "loading" });
    try {
      const response = await fetch("/api/gmail/ai/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: cleanQuestion }),
      });
      const payload = (await response.json()) as GmailAiSearchResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.success ? "Recherche incomplète." : payload.error);
      }
      setSearchState({
        status: "success",
        answer: payload.data.answer,
        gmailQuery: payload.data.gmailQuery,
        sources: payload.data.sources,
      });
    } catch (error) {
      setSearchState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "La recherche intelligente n’est pas disponible.",
      });
    }
  }

  async function confirmAndRunTriage() {
    if (isTriageRunning || messages.length === 0) return;
    setConfirmTriage(false);
    setTriageState({ status: "idle" });
    try {
      const items = await onTriage(messages.slice(0, 10).map((message) => message.id));
      setTriageState({ status: "success", items });
    } catch (error) {
      setTriageState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Le tri intelligent a échoué.",
      });
    }
  }

  return (
    <section
      aria-labelledby="ai-command-title"
      className="mt-4 rounded-2xl border border-[#cddcff] bg-[#f7faff] p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-800">
          <MailboxIcon name="sparkles" className="size-5" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-blue-700">
            Centre IA
          </p>
          <h2 id="ai-command-title" className="mt-1 text-xl font-semibold text-blue-950">
            Piloter la boîte en langage naturel
          </h2>
          <p className="mt-1 text-sm leading-6 text-blue-900">
            Recherchez dans Gmail, classez les messages visibles ou personnalisez la rédaction.
          </p>
        </div>
      </div>

      <form onSubmit={askMailbox} className="mt-4">
        <label htmlFor="ai-mailbox-question" className="text-sm font-semibold text-blue-950">
          Poser une question sur vos emails
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id="ai-mailbox-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={500}
            placeholder="Ex. Quels messages urgents nécessitent une réponse cette semaine ?"
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-blue-200 bg-white px-4 text-base text-blue-950 outline-none focus:border-blue-700 focus:ring-1 focus:ring-blue-700 sm:text-sm"
          />
          <button
            type="submit"
            disabled={!question.trim() || searchState.status === "loading"}
            className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900 disabled:cursor-wait disabled:opacity-60"
          >
            <MailboxIcon name="search" className="size-4" />
            {searchState.status === "loading" ? "Recherche…" : "Interroger Gmail"}
          </button>
        </div>
      </form>

      {searchState.status === "error" ? (
        <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {searchState.message}
        </p>
      ) : null}
      {searchState.status === "success" ? (
        <div className="mt-4 rounded-xl border border-blue-200 bg-white p-4">
          <p className="whitespace-pre-wrap text-sm leading-6 text-[#27272a]">
            {searchState.answer}
          </p>
          {searchState.sources.length ? (
            <ol className="mt-3 space-y-1 border-t border-[#e4e4e7] pt-3 text-xs leading-5 text-[#52525b]">
              {searchState.sources.map((source, index) => (
                <li key={source.messageId}>
                  [{index + 1}] {source.sender} — {source.subject} ·{" "}
                  {new Date(source.receivedAt).toLocaleDateString("fr-FR")}
                </li>
              ))}
            </ol>
          ) : null}
          {searchState.gmailQuery ? (
            <button
              type="button"
              onClick={() => onApplyGmailQuery(searchState.gmailQuery)}
              className="mt-3 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-900 transition-colors hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900"
            >
              Afficher ces résultats dans la liste
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-blue-200 bg-white p-4">
          <p className="font-semibold text-blue-950">Tri IA de la page visible</p>
          <p className="mt-1 text-sm leading-6 text-blue-900">
            Analyse jusqu’à 10 messages et crée des libellés Gmail par catégorie, priorité
            et réponse attendue.
          </p>
          {confirmTriage ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm leading-6 text-amber-950">
                Le contenu des messages sera transmis à Groq, puis les libellés seront
                réellement ajoutés dans Gmail.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void confirmAndRunTriage()}
                  className="min-h-11 cursor-pointer rounded-xl bg-[#18181b] px-3 text-sm font-semibold text-white hover:bg-[#3f3f46] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18181b]"
                >
                  Confirmer le classement
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmTriage(false)}
                  className="min-h-11 cursor-pointer rounded-xl border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-950 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-900"
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmTriage(true)}
              disabled={!messages.length || isTriageRunning}
              className="mt-3 inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-900 transition-colors hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900 disabled:cursor-wait disabled:opacity-60"
            >
              <MailboxIcon name="label" className="size-4" />
              {isTriageRunning ? "Classement en cours…" : "Classer la page avec Groq"}
            </button>
          )}
          {triageState.status === "success" ? (
            <div className="mt-3 text-sm leading-6 text-emerald-900">
              <p className="font-semibold">{triageState.items.length} message(s) classé(s).</p>
              <ul className="mt-1 space-y-1 text-xs">
                {triageState.items.slice(0, 5).map((item) => (
                  <li key={item.messageId}>
                    {AI_CATEGORY_LABELS[item.category]} · priorité{" "}
                    {AI_PRIORITY_LABELS[item.priority].toLocaleLowerCase("fr-FR")}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {triageState.status === "error" ? (
            <p role="alert" className="mt-3 text-sm text-red-900">
              {triageState.message}
            </p>
          ) : null}
        </div>

        <details className="rounded-xl border border-blue-200 bg-white p-4">
          <summary className="min-h-11 cursor-pointer font-semibold text-blue-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900">
            Préférences de l’assistant
          </summary>
          <div className="mt-2 grid gap-3">
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl bg-blue-50 p-3 text-sm leading-6 text-blue-950">
              <input
                type="checkbox"
                checked={preferences.autoTriage}
                onChange={(event) =>
                  onPreferencesChange({
                    ...preferences,
                    autoTriage: event.target.checked,
                  })
                }
                className="mt-1 size-4"
              />
              <span>
                <strong>Tri automatique quand le site est ouvert</strong><br />
                Classe par lots les nouveaux messages visibles qui n’ont pas encore de
                catégorie IA.
              </span>
            </label>
            <div>
              <label htmlFor="ai-writing-style" className="text-sm font-semibold text-blue-950">
                Mon style de rédaction
              </label>
              <textarea
                id="ai-writing-style"
                rows={3}
                maxLength={500}
                value={preferences.writingStyle}
                onChange={(event) =>
                  onPreferencesChange({
                    ...preferences,
                    writingStyle: event.target.value,
                  })
                }
                placeholder="Ex. phrases courtes, ton professionnel, vouvoiement…"
                className="mt-2 w-full resize-y rounded-xl border border-blue-200 bg-white px-3 py-2 text-base leading-6 text-blue-950 outline-none focus:border-blue-700 focus:ring-1 focus:ring-blue-700 sm:text-sm"
              />
              <p className="mt-1 text-xs leading-5 text-blue-800">
                Ces préférences restent dans ce navigateur. Les emails ne sont envoyés à
                Groq que lors d’une fonction IA.
              </p>
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}
