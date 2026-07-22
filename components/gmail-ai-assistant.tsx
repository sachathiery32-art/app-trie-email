"use client";

import { useState } from "react";

import { MailboxIcon } from "@/components/mailbox-icon";
import {
  AI_CATEGORY_LABELS,
  AI_PRIORITY_LABELS,
  type GmailAiAnalysis,
  type GmailAiAnalysisResponse,
  type GmailAiApplyResponse,
} from "@/types/ai";
import type { GmailMessageDetail } from "@/types/gmail";

const analysisCache = new Map<string, GmailAiAnalysis>();

const PRIORITY_STYLES = {
  urgent: "border-red-200 bg-red-50 text-red-900",
  high: "border-orange-200 bg-orange-50 text-orange-900",
  normal: "border-blue-200 bg-blue-50 text-blue-900",
  low: "border-slate-200 bg-slate-50 text-slate-700",
} as const;

export function GmailAiAssistant({
  message,
  onUseReply,
  onLabelsApplied,
}: {
  message: GmailMessageDetail;
  onUseReply: (body: string) => void;
  onLabelsApplied: () => void;
}) {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "success"; data: GmailAiAnalysis }
    | { status: "error"; message: string }
  >(() => {
    const cached = analysisCache.get(message.id);
    return cached ? { status: "success", data: cached } : { status: "idle" };
  });
  const [applyState, setApplyState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "success"; labels: string[] }
    | { status: "error"; message: string }
  >({ status: "idle" });

  async function analyze() {
    if (state.status === "loading") return;
    setState({ status: "loading" });
    setApplyState({ status: "idle" });
    try {
      const response = await fetch("/api/gmail/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: message.id }),
      });
      const payload = (await response.json()) as GmailAiAnalysisResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.success ? "Analyse incomplète." : payload.error);
      }
      analysisCache.set(message.id, payload.data);
      setState({ status: "success", data: payload.data });
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Cette conversation ne peut pas être analysée.",
      });
    }
  }

  async function applyLabels() {
    if (state.status !== "success" || applyState.status === "loading") return;
    setApplyState({ status: "loading" });
    try {
      const response = await fetch("/api/gmail/ai/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: message.id,
          category: state.data.category,
          priority: state.data.priority,
          requiresReply: state.data.requiresReply,
        }),
      });
      const payload = (await response.json()) as GmailAiApplyResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.success ? "Classement incomplet." : payload.error);
      }
      setApplyState({ status: "success", labels: payload.data.appliedLabels });
      onLabelsApplied();
    } catch (error) {
      setApplyState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Les libellés n'ont pas été appliqués.",
      });
    }
  }

  return (
    <section
      aria-labelledby={`ai-assistant-${message.id}`}
      className="mt-8 rounded-2xl border border-[#d8c987] bg-[#fffaf0] p-4 sm:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#f5e8b9] text-[#6b5200]">
            <MailboxIcon name="sparkles" className="size-5" />
          </div>
          <div>
            <h3 id={`ai-assistant-${message.id}`} className="font-semibold text-[#332a0d]">
              Analyse intelligente de la conversation
            </h3>
            <p className="mt-1 text-sm leading-6 text-[#6d5c28]">
              Résumé, priorité, tâches, échéances et réponses proposées par Groq.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void analyze()}
          disabled={state.status === "loading"}
          className="inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#171717] px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[#333] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171717] disabled:cursor-wait disabled:opacity-60"
        >
          <MailboxIcon name="sparkles" className="size-4" />
          {state.status === "loading"
            ? "Analyse…"
            : state.status === "success"
              ? "Actualiser l'analyse"
              : "Analyser avec Groq"}
        </button>
      </div>

      {state.status === "idle" ? (
        <p className="mt-4 text-xs leading-5 text-[#6d5c28]">
          En lançant l’analyse, le contenu de la conversation sera transmis à Groq. Aucun
          libellé ne sera modifié sans une action distincte.
        </p>
      ) : null}
      {state.status === "loading" ? (
        <div className="mt-5 space-y-3" aria-live="polite" aria-busy="true">
          <div className="h-4 w-full animate-pulse rounded bg-[#eadca8] motion-reduce:animate-none" />
          <div className="h-4 w-4/5 animate-pulse rounded bg-[#eadca8] motion-reduce:animate-none" />
        </div>
      ) : null}
      {state.status === "error" ? (
        <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {state.message}
        </p>
      ) : null}

      {state.status === "success" ? (
        <div className="mt-5 grid gap-4">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-[#d8c987] bg-white px-3 py-1 text-xs font-semibold text-[#5f4d17]">
              {AI_CATEGORY_LABELS[state.data.category]} · {Math.round(state.data.confidence)} %
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${PRIORITY_STYLES[state.data.priority]}`}>
              Priorité {AI_PRIORITY_LABELS[state.data.priority].toLocaleLowerCase("fr-FR")}
            </span>
            {state.data.requiresReply ? (
              <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-900">
                Réponse nécessaire
              </span>
            ) : null}
          </div>

          <div className="rounded-xl border border-[#e4d7a7] bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7d6d39]">Résumé</p>
            <p className="mt-2 text-sm leading-6 text-[#332a0d]">{state.data.summary}</p>
            <p className="mt-3 text-sm font-semibold text-[#5f4d17]">Action conseillée</p>
            <p className="mt-1 text-sm leading-6 text-[#332a0d]">{state.data.suggestedAction}</p>
          </div>

          {state.data.actionItems.length || state.data.deadlines.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-[#e4d7a7] bg-white p-4">
                <p className="text-sm font-semibold text-[#332a0d]">Tâches détectées</p>
                {state.data.actionItems.length ? (
                  <ul className="mt-2 space-y-2 text-sm leading-6 text-[#5f4d17]">
                    {state.data.actionItems.map((item, index) => (
                      <li key={`${item.title}-${index}`} className="flex gap-2">
                        <MailboxIcon name="check" className="mt-1 size-4 shrink-0" />
                        <span>
                          {item.title}
                          {item.dueDate ? ` — ${item.dueDate}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-[#7d6d39]">Aucune tâche explicite.</p>
                )}
                {state.data.deadlines.length ? (
                  <>
                    <p className="mt-3 text-sm font-semibold text-[#332a0d]">
                      Échéances mentionnées
                    </p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-[#5f4d17]">
                      {state.data.deadlines.map((deadline, index) => (
                        <li key={`${deadline}-${index}`}>{deadline}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
              <div className="rounded-xl border border-[#e4d7a7] bg-white p-4">
                <p className="text-sm font-semibold text-[#332a0d]">Priorité et risques</p>
                <p className="mt-2 text-sm leading-6 text-[#5f4d17]">{state.data.priorityReason}</p>
                {state.data.risks.length ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-800">
                    {state.data.risks.map((risk, index) => (
                      <li key={`${risk}-${index}`}>{risk}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          ) : null}

          {state.data.suggestedReplies.length ? (
            <div>
              <p className="text-sm font-semibold text-[#332a0d]">Réponses proposées</p>
              <div className="mt-2 grid gap-2">
                {state.data.suggestedReplies.map((reply, index) => (
                  <button
                    key={`${reply}-${index}`}
                    type="button"
                    onClick={() => onUseReply(reply)}
                    className="min-h-11 cursor-pointer rounded-xl border border-[#e4d7a7] bg-white p-3 text-left text-sm leading-6 text-[#332a0d] transition-colors duration-200 hover:bg-[#fff4cf] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6b5200]"
                  >
                    {reply}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 border-t border-[#e4d7a7] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p aria-live="polite" className={`text-xs leading-5 ${applyState.status === "error" ? "text-red-800" : "text-[#6d5c28]"}`}>
              {applyState.status === "idle" &&
                "Vérifiez le résultat avant de créer les libellés IA dans Gmail."}
              {applyState.status === "loading" && "Application des libellés dans Gmail…"}
              {applyState.status === "success" &&
            `Libellés appliqués : ${applyState.labels.join(", ")}.`}
              {applyState.status === "error" && applyState.message}
            </p>
            <button
              type="button"
              onClick={() => void applyLabels()}
              disabled={applyState.status === "loading"}
              className="inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#c9b965] bg-white px-4 text-sm font-semibold text-[#5f4d17] transition-colors duration-200 hover:bg-[#fff4cf] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6b5200] disabled:cursor-wait disabled:opacity-60"
            >
              <MailboxIcon name="label" className="size-4" />
              Appliquer le classement
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
