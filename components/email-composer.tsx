"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { MailboxIcon } from "@/components/mailbox-icon";
import type {
  ComposerMessage,
  ComposerSession,
  DraftMessageRequest,
  DraftMessageResponse,
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
  onSaveDraft?: (message: ComposerMessage) => void;
  onSend: (message: ComposerMessage) => void | Promise<void>;
  deliveryMode?: "demo" | "gmail";
  senderEmail?: string;
};

export function EmailComposer({
  session,
  onClose,
  onSaveDraft,
  onSend,
  deliveryMode = "demo",
  senderEmail,
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
    session.mode === "compose"
      ? "Rédige un message clair pour présenter ma demande."
      : "Réponds clairement et confirme les prochaines étapes.",
  );
  const [aiState, setAiState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "success"; model: string }
    | { status: "error"; message: string }
  >({ status: "idle" });
  const [sendState, setSendState] = useState<
    | { status: "editing" }
    | { status: "confirming" }
    | { status: "sending" }
    | { status: "error"; message: string }
  >({ status: "editing" });
  const sendInFlight = useRef(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && sendState.status !== "sending") {
        onClose();
      }
    }

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, sendState.status]);

  function updateField(field: keyof ComposerMessage, value: string) {
    if (sendState.status !== "editing") {
      setSendState({ status: "editing" });
    }
    setMessage((currentMessage) => ({
      ...currentMessage,
      [field]: value,
    }));
  }

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (deliveryMode === "gmail") {
      setSendState({ status: "confirming" });
      return;
    }
    void onSend(message);
  }

  async function confirmRealSend() {
    if (sendInFlight.current) {
      return;
    }

    sendInFlight.current = true;
    setSendState({ status: "sending" });
    try {
      await onSend(message);
    } catch (error) {
      setSendState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Le message n'a pas pu être envoyé.",
      });
    } finally {
      sendInFlight.current = false;
    }
  }

  async function generateWithAi() {
    const sourceEmailId = session.sourceEmailId;
    const isReply = session.mode === "reply" && Boolean(sourceEmailId);
    const isNewMessage = session.mode === "compose";

    if (!isReply && !isNewMessage) {
      return;
    }

    setAiState({ status: "loading" });

    const endpoint = isReply ? "/api/draft-reply" : "/api/draft-message";
    const requestBody: DraftReplyRequest | DraftMessageRequest = isReply
      ? {
          emailId: sourceEmailId ?? "",
          tone,
          instruction,
        }
      : {
          recipient: message.to,
          tone,
          instruction,
        };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const payload = (await response.json()) as
        | DraftReplyResponse
        | DraftMessageResponse;

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
            : "Impossible de générer le message.",
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
              {deliveryMode === "gmail" ? "Envoi Gmail réel" : "Mode démonstration"}
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
            disabled={sendState.status === "sending"}
            aria-label="Fermer la rédaction"
            className="flex size-11 cursor-pointer items-center justify-center rounded-xl text-[#5f6979] transition-colors duration-200 hover:bg-[#f1f2f4] hover:text-[#171717] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171717] disabled:cursor-not-allowed disabled:opacity-50"
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

              {(session.mode === "compose" ||
                (session.mode === "reply" && session.sourceEmailId)) && (
                <section
                  aria-labelledby="ai-writing-title"
                  className="rounded-2xl border border-[#e0d5ac] bg-[#fffaf0] p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#f5e8b9] text-[#6b5200]">
                      <MailboxIcon name="sparkles" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3
                        id="ai-writing-title"
                        className="font-semibold text-[#332a0d]"
                      >
                        {session.mode === "compose"
                          ? "Assistant de rédaction Groq"
                          : "Proposition de réponse Groq"}
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-[#6d5c28]">
                        {session.mode === "compose"
                          ? "Décrivez le message souhaité : Groq préparera l’objet et le contenu."
                          : "Décrivez l’objectif : Groq préparera un brouillon que vous pourrez modifier."}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
                    <div>
                      <label
                        htmlFor="writing-tone"
                        className="text-xs font-semibold text-[#5f4d17]"
                      >
                        Ton
                      </label>
                      <select
                        id="writing-tone"
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
                        htmlFor="writing-instruction"
                        className="text-xs font-semibold text-[#5f4d17]"
                      >
                        Consigne
                      </label>
                      <input
                        id="writing-instruction"
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
                        (session.mode === "compose"
                          ? "Indiquez ce que vous voulez communiquer, sans données sensibles."
                          : "Le contenu utilisé est entièrement fictif.")}
                      {aiState.status === "loading" &&
                        "Génération du brouillon en cours…"}
                      {aiState.status === "success" &&
                        `Message généré avec ${aiState.model}.`}
                      {aiState.status === "error" && aiState.message}
                    </p>
                    <button
                      type="button"
                      onClick={generateWithAi}
                      disabled={aiState.status === "loading"}
                      className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#171717] px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[#333] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171717] disabled:cursor-not-allowed disabled:bg-[#9da3ae]"
                    >
                      <MailboxIcon name="sparkles" className="size-4" />
                      {aiState.status === "loading"
                        ? "Génération…"
                        : session.mode === "compose"
                          ? "Rédiger avec Groq"
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

          {deliveryMode === "gmail" && sendState.status !== "editing" ? (
            <section
              aria-live="assertive"
              className={`border-t px-4 py-4 sm:px-6 ${
                sendState.status === "error"
                  ? "border-red-200 bg-red-50"
                  : "border-blue-200 bg-blue-50"
              }`}
            >
              {sendState.status === "error" ? (
                <>
                  <p className="font-semibold text-red-900">Envoi interrompu</p>
                  <p className="mt-1 text-sm leading-6 text-red-800">
                    {sendState.message}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSendState({ status: "editing" })}
                    className="mt-3 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-red-300 bg-white px-4 text-sm font-semibold text-red-900 transition-colors duration-200 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-900"
                  >
                    Corriger le message
                  </button>
                </>
              ) : (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-blue-950">
                      {sendState.status === "sending"
                        ? "Envoi Gmail en cours…"
                        : "Confirmer l’envoi réel"}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-blue-900">
                      À <strong>{message.to}</strong> · Objet :{" "}
                      <strong>{message.subject}</strong>
                    </p>
                    {message.cc || message.bcc ? (
                      <p className="mt-1 text-xs leading-5 text-blue-800">
                        {message.cc ? `Cc : ${message.cc}` : ""}
                        {message.cc && message.bcc ? " · " : ""}
                        {message.bcc ? `Cci : ${message.bcc}` : ""}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs leading-5 text-blue-800">
                      Après confirmation, Gmail remettra réellement ce message
                      aux destinataires.
                    </p>
                  </div>
                  <div className="grid shrink-0 grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSendState({ status: "editing" })}
                      disabled={sendState.status === "sending"}
                      className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-blue-300 bg-white px-4 text-sm font-semibold text-blue-900 transition-colors duration-200 hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Retour
                    </button>
                    <button
                      type="button"
                      onClick={confirmRealSend}
                      disabled={sendState.status === "sending"}
                      className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#2563eb] px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[#1d4ed8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18181b] disabled:cursor-wait disabled:bg-[#93c5fd]"
                    >
                      <MailboxIcon name="send" className="size-4" />
                      {sendState.status === "sending"
                        ? "Envoi…"
                        : "Envoyer maintenant"}
                    </button>
                  </div>
                </div>
              )}
            </section>
          ) : null}

          <footer className="flex flex-col-reverse gap-3 border-t border-[#e3e6eb] bg-[#fafafa] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-center text-xs leading-5 text-[#667085] sm:text-left">
              {deliveryMode === "gmail"
                ? `Envoi depuis ${senderEmail || "le compte Gmail connecté"}.`
                : "Aucun email réel ne sera envoyé dans cette version."}
            </p>
            <div
              className={onSaveDraft ? "grid grid-cols-2 gap-2 sm:flex" : "flex"}
            >
              {onSaveDraft ? (
                <button
                  type="button"
                  onClick={() => onSaveDraft(message)}
                  className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#cfd3da] bg-white px-4 text-sm font-semibold text-[#394150] transition-colors duration-200 hover:bg-[#f1f2f4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171717]"
                >
                  <MailboxIcon name="draft" className="size-4" />
                  Brouillon
                </button>
              ) : null}
              <button
                type="submit"
                disabled={sendState.status !== "editing"}
                className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#2563eb] px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[#1d4ed8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171717] disabled:cursor-wait disabled:bg-[#93c5fd]"
              >
                <MailboxIcon name="send" className="size-4" />
                {deliveryMode === "gmail" ? "Vérifier l’envoi" : "Envoyer la démo"}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}
