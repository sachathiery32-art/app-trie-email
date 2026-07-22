"use client";

import { useState } from "react";

import { MailboxIcon } from "@/components/mailbox-icon";
import type {
  GmailAttachmentAnalysis,
  GmailAttachmentAnalysisResponse,
} from "@/types/ai";
import type { GmailAttachmentSummary } from "@/types/gmail";

const ANALYZABLE_MIME_TYPES = new Set([
  "application/pdf",
  "application/json",
  "application/xml",
  "application/csv",
  "application/rtf",
  "application/x-ndjson",
]);

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function canAnalyze(attachment: GmailAttachmentSummary) {
  return Boolean(
    attachment.id &&
      attachment.size > 0 &&
      attachment.size <= 3 * 1024 * 1024 &&
      (attachment.mimeType.startsWith("text/") ||
        ANALYZABLE_MIME_TYPES.has(attachment.mimeType) ||
        /\.(pdf|txt|csv|json|xml|md|rtf|log)$/i.test(attachment.filename)),
  );
}

function AnalysisList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-blue-800">
        {title}
      </p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-blue-950">
        {items.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function GmailAttachmentCard({
  messageId,
  attachment,
}: {
  messageId: string;
  attachment: GmailAttachmentSummary;
}) {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "success"; data: GmailAttachmentAnalysis }
    | { status: "error"; message: string }
  >({ status: "idle" });

  const downloadUrl = attachment.id
    ? `/api/gmail/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachment.id)}?${new URLSearchParams({ filename: attachment.filename })}`
    : null;
  const analyzable = canAnalyze(attachment);

  async function analyze() {
    if (!attachment.id || state.status === "loading") return;
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/gmail/ai/attachment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId,
          attachmentId: attachment.id,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
        }),
      });
      const payload = (await response.json()) as GmailAttachmentAnalysisResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.success ? "Analyse incomplète." : payload.error);
      }
      setState({ status: "success", data: payload.data });
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Cette pièce jointe ne peut pas être analysée.",
      });
    }
  }

  return (
    <li className="min-w-0 rounded-xl border border-[#e4e4e7] bg-[#fafafa] p-3">
      <div className="flex min-w-0 items-center gap-3">
        <MailboxIcon name="attachment" className="size-5 shrink-0 text-[#52525b]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[#27272a]">
            {attachment.filename}
          </p>
          <p className="mt-1 text-xs text-[#52525b]">
            {formatFileSize(attachment.size)} · {attachment.mimeType || "Format inconnu"}
          </p>
        </div>
        {downloadUrl ? (
          <a
            href={downloadUrl}
            aria-label={`Télécharger ${attachment.filename}`}
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-[#d4d4d8] bg-white text-[#3f3f46] transition-colors hover:bg-[#f1f1f3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
          >
            <MailboxIcon name="download" className="size-4" />
          </a>
        ) : null}
      </div>

      {analyzable ? (
        <button
          type="button"
          onClick={() => void analyze()}
          disabled={state.status === "loading"}
          className="mt-3 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-3 text-sm font-semibold text-blue-900 transition-colors hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900 disabled:cursor-wait disabled:opacity-60"
        >
          <MailboxIcon name="sparkles" className="size-4" />
          {state.status === "loading"
            ? "Analyse en cours…"
            : state.status === "success"
              ? "Actualiser l’analyse"
              : "Analyser le document"}
        </button>
      ) : (
        <p className="mt-3 text-xs leading-5 text-[#71717a]">
          Analyse IA disponible pour les PDF contenant du texte et les fichiers texte,
          CSV, JSON ou XML de 3 Mo maximum.
        </p>
      )}

      {state.status === "error" ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-900">
          {state.message}
        </p>
      ) : null}
      {state.status === "success" ? (
        <div className="mt-3 grid gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-blue-800">
              {state.data.documentType || "Document"}
            </p>
            <p className="mt-1 text-sm leading-6 text-blue-950">{state.data.summary}</p>
          </div>
          <AnalysisList title="Informations clés" items={state.data.keyFacts} />
          <AnalysisList title="Dates" items={state.data.dates} />
          <AnalysisList title="Montants" items={state.data.amounts} />
          <AnalysisList title="Actions" items={state.data.actionItems} />
          <AnalysisList title="Points de vigilance" items={state.data.warnings} />
        </div>
      ) : null}
    </li>
  );
}
