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
  triageProgress: { completed: number; total: number } | null;
  onTriage: (messageIds: string[]) => Promise<GmailAiTriageItem[]>;
  onApplyGmailQuery: (query: string) => void;
  onSelectSearchResults: (messageIds: string[], query: string) => void;
  preferences: AiUserPreferences;
  onPreferencesChange: (preferences: AiUserPreferences) => void;
};

export function GmailAiCommandCenter({
  messages,
  isTriageRunning,
  triageProgress,
  onTriage,
  onApplyGmailQuery,
  onSelectSearchResults,
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
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(
    () => new Set(),
  );
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
      let result: Extract<GmailAiSearchResponse, { success: true }> | null = null;
      for (let attempt = 0; attempt < 3 && !result; attempt += 1) {
        const response = await fetch("/api/gmail/ai/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: cleanQuestion }),
        });
        const payload = (await response.json()) as GmailAiSearchResponse;
        if (response.status === 429 && attempt < 2) {
          const retrySeconds = Number(response.headers.get("Retry-After"));
          const delay = Math.min(
            30_000,
            Math.max(2_000, (Number.isFinite(retrySeconds) ? retrySeconds : 5) * 1_000),
          );
          await new Promise((resolve) => window.setTimeout(resolve, delay));
          continue;
        }
        if (!response.ok || !payload.success) {
          throw new Error(payload.success ? "Recherche incomplète." : payload.error);
        }
        result = payload;
      }
      if (!result) throw new Error("L’assistant Gmail reste temporairement indisponible.");
      setSearchState({
        status: "success",
        answer: result.data.answer,
        gmailQuery: result.data.gmailQuery,
        sources: result.data.sources,
      });
      setSelectedSourceIds(
        new Set(result.data.sources.map((source) => source.messageId)),
      );
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
      const items = await onTriage(messages.slice(0, 100).map((message) => message.id));
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
        <div aria-live="polite" className="mt-4 rounded-2xl border border-blue-200 bg-white p-4 sm:p-5">
          <div className="rounded-xl bg-[#f8fafc] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-blue-700">
              Réponse de l’assistant
            </p>
            <p className="mt-2 max-w-3xl whitespace-pre-wrap text-base leading-7 text-[#18181b]">
              {searchState.answer}
            </p>
          </div>
          {searchState.sources.length ? (
            <div className="mt-4 border-t border-[#e4e4e7] pt-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-[#18181b]">
                    Emails trouvés ({searchState.sources.length})
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[#52525b]">
                    Cochez les emails que vous souhaitez retrouver et manipuler dans la liste.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedSourceIds((current) =>
                      current.size === searchState.sources.length
                        ? new Set()
                        : new Set(searchState.sources.map((source) => source.messageId)),
                    )
                  }
                  className="min-h-11 cursor-pointer self-start rounded-xl px-3 text-sm font-semibold text-blue-800 transition-colors hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
                >
                  {selectedSourceIds.size === searchState.sources.length
                    ? "Tout désélectionner"
                    : "Tout sélectionner"}
                </button>
              </div>
              <ol className="mt-3 grid gap-2 md:grid-cols-2">
                {searchState.sources.map((source, index) => {
                  const selected = selectedSourceIds.has(source.messageId);
                  return (
                    <li key={source.messageId}>
                      <label
                        className={`flex min-h-20 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors duration-200 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-700 ${
                          selected
                            ? "border-blue-300 bg-blue-50"
                            : "border-[#e4e4e7] bg-white hover:bg-[#f8fafc]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() =>
                            setSelectedSourceIds((current) => {
                              const next = new Set(current);
                              if (next.has(source.messageId)) next.delete(source.messageId);
                              else next.add(source.messageId);
                              return next;
                            })
                          }
                          aria-label={`Sélectionner l’email ${source.subject}`}
                          className="mt-1 size-4 shrink-0 accent-blue-700"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-bold text-blue-700">
                            Source [{index + 1}]
                          </span>
                          <span className="mt-1 block truncate text-sm font-semibold text-[#18181b]">
                            {source.subject || "Sans objet"}
                          </span>
                          <span className="mt-1 block truncate text-xs text-[#52525b]">
                            {source.sender} · {new Date(source.receivedAt).toLocaleDateString("fr-FR")}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : null}
          {searchState.gmailQuery ? (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={selectedSourceIds.size === 0}
                onClick={() =>
                  onSelectSearchResults(
                    [...selectedSourceIds],
                    searchState.gmailQuery,
                  )
                }
                className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <MailboxIcon name="check" className="size-4" />
                Afficher et sélectionner {selectedSourceIds.size || "les"} email(s)
              </button>
              <button
                type="button"
                onClick={() => onApplyGmailQuery(searchState.gmailQuery)}
                className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-900 transition-colors hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900"
              >
                Afficher tous les résultats
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-blue-200 bg-white p-4">
          <p className="font-semibold text-blue-950">Tri IA de la page visible</p>
          <p className="mt-1 text-sm leading-6 text-blue-900">
            Analyse jusqu’à 100 messages par lots sécurisés et crée les libellés Gmail
            par catégorie, priorité et réponse attendue.
          </p>
          {confirmTriage ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm leading-6 text-amber-950">
                Le contenu des messages sera transmis à xKiro, puis les libellés seront
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
              {isTriageRunning
                ? triageProgress
                  ? `Classement ${triageProgress.completed}/${triageProgress.total}…`
                  : "Préparation du classement…"
                : `Classer jusqu’à ${Math.min(messages.length, 100)} messages`}
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
            <div className="flex min-h-11 items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-950">
              <MailboxIcon name="check" className="mt-1 size-4 shrink-0" />
              <span>
                <strong>Tri automatique toujours actif</strong><br />
                Les nouveaux messages sont classés par lots dès leur synchronisation,
                sans action manuelle.
              </span>
            </div>
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
                xKiro que lors d’une fonction IA.
              </p>
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}
