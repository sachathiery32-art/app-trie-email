"use client";

import { useEffect, useState, type FormEvent } from "react";

import { MailboxIcon } from "@/components/mailbox-icon";
import type {
  ComposerMessage,
  ComposerSession,
  DraftReplyRequest,
  DraftReplyResponse,
  ReplyTone,
} from "@/types/email";

const COMPOSER_TITLES: Record<ComposerSession["mode"], string> = {
  compose: "Nouveau message",
  reply: "Répondre",
  forward: "Transférer",
  draft: "Modifier le brouillon",
};

const TONE_LABELS: Record<ReplyTone, string> = {
  concise: "Concis",
  professional: "Professionnel",
  friendly: "Chaleureux",
};

type EmailComposerProps = {
  session: ComposerSession;
  onClose: () => void;
  onSaveDraft: (message: ComposerMessage) => void;
  onSend: (message: ComposerMessage) => void;
};

export function EmailComposer({
  session,
  onClose,
  onSaveDraft,
  onSend,
}: EmailComposerProps) {
  const [message, setMessage] = useState<ComposerMessage>({
    to: session.to,
    cc: session.cc,
    bcc: session.bcc,
    subject: session.subject,
    body: session.body,
  });
  const [showCopies, setShowCopies] = useState(
    Boolean(session.cc || session.bcc),
  );
  const [tone, setTone] = useState<ReplyTone>("professional");
  const [instruction, setInstruction] = useState(
    "Réponds clairement et confirme les prochaines étapes.",
  );
  const [aiState, setAiState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "success"; model: string }
    | { status: "error"; message: string }
  >({ status: "idle" });

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  function updateField(field: keyof ComposerMessage, value: string) {
    setMessage((currentMessage) => ({
      ...currentMessage,
      [field]: value,
    }));
  }

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSend(message);
  }

  async function generateReply() {
    if (!session.sourceEmailId) {
      return;
    }

    setAiState({ status: "loading" });

    const requestBody: DraftReplyRequest = {
      emailId: session.sourceEmailId,
      tone,
      instruction,
    };

    try {
      const response = await fetch("/api/draft-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const payload = (await response.json()) as DraftReplyResponse;

      if (!response.ok || !payload.success) {
        throw new Error(
          payload.success
            ? "La réponse du serveur est incomplète."
            : payload.error,
        );
      }

      setMessage((currentMessage) => ({
        ...currentMessage,
        subject: payload.data.subject,
        body: payload.data.body,
      }));
      setAiState({ status: "success", model: payload.data.model });
    } catch (error) {
      setAiState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Impossible de générer la réponse.",
      });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="composer-title"
        className="flex max-h-[100dvh] min-h-[80dvh] w-full flex-col bg-white sm:max-h-[90dvh] sm:min-h-0 sm:max-w-3xl sm:rounded-2xl sm:border sm:border-[#d9dce2]"
      >
        <header className="flex min-h-16 items-center justify-between border-b border-[#e3e6eb] px-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#826408]">
              Mode démonstration
            </p>
            <h2
              id="composer-title"
              className="mt-0.5 font-semibold text-[#171717]"
            >
              {COMPOSER_TITLES[session.mode]}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la rédaction"
            className="flex size-11 cursor-pointer items-center justify-center rounded-xl text-[#5f6979] transition-colors duration-200 hover:bg-[#f1f2f4] hover:text-[#171717] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171717]"
          >
            <MailboxIcon name="close" />
          </button>
        </header>

        <form onSubmit={submitMessage} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            <div className="grid gap-4">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <label
                    htmlFor="composer-to"
                    className="text-sm font-semibold text-[#394150]"
                  >
                    Destinataire
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowCopies((isVisible) => !isVisible)}
                    className="min-h-11 cursor-pointer px-2 text-sm font-semibold text-[#526071] underline-offset-4 hover:text-[#171717] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171717]"
                  >
                    Cc / Cci
                  </button>
                </div>
                <input
                  id="composer-to"
                  type="email"
                  multiple
                  autoFocus
                  required
                  maxLength={1_000}
                  value={message.to}
                  onChange={(event) => updateField("to", event.target.value)}
                  placeholder="nom@exemple.com"
                  className="mt-1 min-h-12 w-full rounded-xl border border-[#d9dce2] px-4 text-base text-[#171717] outline-none transition-colors focus:border-[#171717] focus:ring-1 focus:ring-[#171717]"
                />
                <p className="mt-1 text-xs text-[#667085]">
                  Séparez plusieurs adresses par une virgule.
                </p>
              </div>

              {showCopies && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="composer-cc"
                      className="text-sm font-semibold text-[#394150]"
                    >
                      Copie (Cc)
                    </label>
                    <input
                      id="composer-cc"
                      type="email"
                      multiple
                      maxLength={1_000}
                      value={message.cc}
                      onChange={(event) => updateField("cc", event.target.value)}
                      className="mt-2 min-h-12 w-full rounded-xl border border-[#d9dce2] px-4 text-base text-[#171717] outline-none focus:border-[#171717] focus:ring-1 focus:ring-[#171717]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="composer-bcc"
                      className="text-sm font-semibold text-[#394150]"
                    >
                      Copie cachée (Cci)
                    </label>
                    <input
                      id="composer-bcc"
                      type="email"
                      multiple
                      maxLength={1_000}
                      value={message.bcc}
                      onChange={(event) => updateField("bcc", event.target.value)}
                      className="mt-2 min-h-12 w-full rounded-xl border border-[#d9dce2] px-4 text-base text-[#171717] outline-none focus:border-[#171717] focus:ring-1 focus:ring-[#171717]"
                    />
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="composer-subject"
                  className="text-sm font-semibold text-[#394150]"
                >
                  Objet
                </label>
                <input
                  id="composer-subject"
                  type="text"
                  required
                  maxLength={500}
                  value={message.subject}
                  onChange={(event) =>
                    updateField("subject", event.target.value)
                  }
                  className="mt-2 min-h-12 w-full rounded-xl border border-[#d9dce2] px-4 text-base text-[#171717] outline-none focus:border-[#171717] focus:ring-1 focus:ring-[#171717]"
                />
              </div>

              {session.mode === "reply" && session.sourceEmailId && (
                <section
                  aria-labelledby="ai-reply-title"
                  className="rounded-2xl border border-[#e0d5ac] bg-[#fffaf0] p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#f5e8b9] text-[#6b5200]">
                      <MailboxIcon name="sparkles" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3
                        id="ai-reply-title"
                        className="font-semibold text-[#332a0d]"
                      >
                        Proposition de réponse Groq
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-[#6d5c28]">
                        Décrivez l’objectif : Groq préparera un brouillon que
                        vous pourrez modifier avant l’envoi simulé.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
                    <div>
                      <label
                        htmlFor="reply-tone"
                        className="text-xs font-semibold text-[#5f4d17]"
                      >
                        Ton
                      </label>
                      <select
                        id="reply-tone"
                        value={tone}
                        onChange={(event) =>
                          setTone(event.target.value as ReplyTone)
                        }
                        className="mt-1 min-h-11 w-full cursor-pointer rounded-xl border border-[#d9c98e] bg-white px-3 text-sm text-[#332a0d] outline-none focus:border-[#171717] focus:ring-1 focus:ring-[#171717]"
                      >
                        {Object.entries(TONE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="reply-instruction"
                        className="text-xs font-semibold text-[#5f4d17]"
                      >
                        Consigne
                      </label>
                      <input
                        id="reply-instruction"
                        value={instruction}
                        maxLength={500}
                        onChange={(event) => setInstruction(event.target.value)}
                        className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c98e] bg-white px-3 text-base text-[#332a0d] outline-none focus:border-[#171717] focus:ring-1 focus:ring-[#171717] sm:text-sm"
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p
                      aria-live="polite"
                      className={`text-xs leading-5 ${
                        aiState.status === "error"
                          ? "text-red-800"
                          : "text-[#6d5c28]"
                      }`}
                    >
                      {aiState.status === "idle" &&
                        "Le contenu utilisé est entièrement fictif."}
                      {aiState.status === "loading" &&
                        "Génération du brouillon en cours…"}
                      {aiState.status === "success" &&
                        `Brouillon généré avec ${aiState.model}.`}
                      {aiState.status === "error" && aiState.message}
                    </p>
                    <button
                      type="button"
                      onClick={generateReply}
                      disabled={aiState.status === "loading"}
                      className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#171717] px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[#333] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171717] disabled:cursor-not-allowed disabled:bg-[#9da3ae]"
                    >
                      <MailboxIcon name="sparkles" className="size-4" />
                      {aiState.status === "loading"
                        ? "Génération…"
                        : "Générer la réponse"}
                    </button>
                  </div>
                </section>
              )}

              <div>
                <div className="flex items-center justify-between gap-3">
                  <label
                    htmlFor="composer-body"
                    className="text-sm font-semibold text-[#394150]"
                  >
                    Message
                  </label>
                  <span className="text-xs text-[#7b8494]">
                    {message.body.length.toLocaleString("fr-FR")} / 20 000
                  </span>
                </div>
                <textarea
                  id="composer-body"
                  required
                  rows={10}
                  maxLength={20_000}
                  value={message.body}
                  onChange={(event) => updateField("body", event.target.value)}
                  className="mt-2 min-h-56 w-full resize-y rounded-xl border border-[#d9dce2] px-4 py-3 text-base leading-7 text-[#171717] outline-none focus:border-[#171717] focus:ring-1 focus:ring-[#171717]"
                  placeholder="Écrivez votre message…"
                />
              </div>
            </div>
          </div>

          <footer className="flex flex-col-reverse gap-3 border-t border-[#e3e6eb] bg-[#fafafa] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-center text-xs leading-5 text-[#667085] sm:text-left">
              Aucun email réel ne sera envoyé dans cette version.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button
                type="button"
                onClick={() => onSaveDraft(message)}
                className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#cfd3da] bg-white px-4 text-sm font-semibold text-[#394150] transition-colors duration-200 hover:bg-[#f1f2f4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171717]"
              >
                <MailboxIcon name="draft" className="size-4" />
                Brouillon
              </button>
              <button
                type="submit"
                className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#2563eb] px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[#1d4ed8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171717]"
              >
                <MailboxIcon name="send" className="size-4" />
                Envoyer la démo
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}
