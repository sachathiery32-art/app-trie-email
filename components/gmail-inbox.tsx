"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { signInWithGoogle, signOutFromApp } from "@/app/actions/auth";
import { EmailComposer } from "@/components/email-composer";
import { MailboxIcon } from "@/components/mailbox-icon";
import type { ComposerMessage } from "@/types/email";
import type {
  GmailInboxData,
  GmailInboxResponse,
  GmailMessageDetail,
  GmailMessageResponse,
  GmailMessageSummary,
  GmailSendResponse,
} from "@/types/gmail";

type AuthenticatedUser = {
  name?: string | null;
  email: string;
};

type InboxState =
  | { status: "loading"; data?: GmailInboxData }
  | { status: "success"; data: GmailInboxData }
  | {
      status: "error";
      message: string;
      reconnect: boolean;
      data?: GmailInboxData;
    };

type DetailState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: GmailMessageDetail }
  | { status: "error"; message: string };

function formatMessageDate(timestamp: number) {
  const date = new Date(timestamp);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();

  return new Intl.DateTimeFormat("fr-FR", {
    ...(isToday
      ? { hour: "2-digit", minute: "2-digit" }
      : { day: "2-digit", month: "short" }),
  }).format(date);
}

function formatFullDate(timestamp: number) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} o`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} Ko`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function LoadingInbox() {
  return (
    <div aria-live="polite" aria-busy="true" className="p-4 sm:p-6">
      <p className="text-sm font-semibold text-[#52525b]">
        Chargement sécurisé de Gmail…
      </p>
      <div className="mt-5 space-y-3">
        {[1, 2, 3, 4, 5].map((item) => (
          <div
            key={item}
            className="h-24 animate-pulse rounded-2xl bg-[#f1f1f3] motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  );
}

function EmptyInbox() {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-[#f1f1f3] text-[#3f3f46]">
        <MailboxIcon name="inbox" className="size-6" />
      </div>
      <h2 className="mt-5 text-lg font-semibold text-[#18181b]">
        Aucun message sur cette page
      </h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-[#52525b]">
        Gmail est bien connecté, mais cette page de réception ne contient aucun
        message.
      </p>
    </div>
  );
}

function MessageRow({
  message,
  selected,
  onSelect,
}: {
  message: GmailMessageSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full cursor-pointer border-b border-[#e4e4e7] p-4 text-left transition-colors duration-200 focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#2563eb] sm:p-5 ${
        selected ? "bg-[#eff6ff]" : "bg-white hover:bg-[#fafafa]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {message.isUnread ? (
            <span className="size-2.5 shrink-0 rounded-full bg-[#2563eb]">
              <span className="sr-only">Message non lu</span>
            </span>
          ) : null}
          <p
            className={`truncate text-sm text-[#18181b] ${
              message.isUnread ? "font-bold" : "font-semibold"
            }`}
          >
            {message.senderName}
          </p>
        </div>
        <time
          dateTime={new Date(message.receivedAt).toISOString()}
          className="shrink-0 text-xs font-medium text-[#52525b]"
        >
          {formatMessageDate(message.receivedAt)}
        </time>
      </div>
      <div className="mt-2 flex items-center gap-2">
        {message.isStarred ? (
          <MailboxIcon name="star" className="size-4 shrink-0 text-amber-600" />
        ) : null}
        <p
          className={`truncate text-sm ${
            message.isUnread
              ? "font-semibold text-[#27272a]"
              : "text-[#3f3f46]"
          }`}
        >
          {message.subject}
        </p>
      </div>
      <p className="mt-1 line-clamp-2 text-sm leading-5 text-[#71717a]">
        {message.snippet}
      </p>
    </button>
  );
}

function MessagePreview({
  message,
  detail,
}: {
  message: GmailMessageSummary | null;
  detail: DetailState;
}) {
  if (!message) {
    return (
      <div className="flex min-h-96 items-center justify-center p-8 text-center text-sm text-[#71717a]">
        Sélectionnez un message pour afficher son contenu.
      </div>
    );
  }

  const completeMessage = detail.status === "success" ? detail.data : null;

  return (
    <article className="p-5 sm:p-8">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            message.isUnread
              ? "bg-blue-50 text-blue-800"
              : "bg-[#f1f1f3] text-[#52525b]"
          }`}
        >
          {message.isUnread ? "Non lu" : "Lu"}
        </span>
        {message.isImportant ? (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
            Important
          </span>
        ) : null}
      </div>

      <h2 className="mt-5 text-2xl font-semibold tracking-[-0.025em] text-[#18181b] sm:text-3xl">
        {message.subject}
      </h2>

      <dl className="mt-6 grid gap-3 rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-4 text-sm sm:grid-cols-[100px_1fr]">
        <dt className="font-semibold text-[#52525b]">De</dt>
        <dd className="min-w-0 break-words text-[#18181b]">
          {message.senderName}
          {message.senderEmail ? ` <${message.senderEmail}>` : ""}
        </dd>
        <dt className="font-semibold text-[#52525b]">À</dt>
        <dd className="min-w-0 break-words text-[#18181b]">
          {message.recipients || "Destinataire non indiqué"}
        </dd>
        {completeMessage?.cc ? (
          <>
            <dt className="font-semibold text-[#52525b]">Copie</dt>
            <dd className="min-w-0 break-words text-[#18181b]">
              {completeMessage.cc}
            </dd>
          </>
        ) : null}
        <dt className="font-semibold text-[#52525b]">Reçu</dt>
        <dd className="text-[#18181b]">
          <time dateTime={new Date(message.receivedAt).toISOString()}>
            {formatFullDate(message.receivedAt)}
          </time>
        </dd>
      </dl>

      <div className="mt-8" aria-live="polite">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#71717a]">
          Contenu du message
        </p>

        {detail.status === "loading" || detail.status === "idle" ? (
          <div className="mt-4 space-y-3" aria-busy="true">
            <div className="h-4 w-full animate-pulse rounded bg-[#e4e4e7] motion-reduce:animate-none" />
            <div className="h-4 w-11/12 animate-pulse rounded bg-[#e4e4e7] motion-reduce:animate-none" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-[#e4e4e7] motion-reduce:animate-none" />
          </div>
        ) : null}

        {detail.status === "error" ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900">
            {detail.message}
          </p>
        ) : null}

        {completeMessage ? (
          <div className="mt-4 whitespace-pre-wrap break-words text-base leading-7 text-[#27272a]">
            {completeMessage.bodyText}
          </div>
        ) : null}

        {completeMessage?.attachments.length ? (
          <section className="mt-8 border-t border-[#e4e4e7] pt-6">
            <h3 className="text-sm font-semibold text-[#18181b]">
              Pièces jointes ({completeMessage.attachments.length})
            </h3>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {completeMessage.attachments.map((attachment, index) => (
                <li
                  key={`${attachment.filename}-${index}`}
                  className="rounded-xl border border-[#e4e4e7] bg-[#fafafa] px-4 py-3"
                >
                  <p className="truncate text-sm font-semibold text-[#27272a]">
                    {attachment.filename}
                  </p>
                  <p className="mt-1 text-xs text-[#52525b]">
                    {attachment.mimeType} · {formatFileSize(attachment.size)}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-5 text-[#52525b]">
              Le téléchargement des pièces jointes sera ajouté dans une étape
              séparée.
            </p>
          </section>
        ) : null}
      </div>
    </article>
  );
}

export function GmailInbox({ user }: { user: AuthenticatedUser }) {
  const [state, setState] = useState<InboxState>({ status: "loading" });
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    null,
  );
  const [detailState, setDetailState] = useState<DetailState>({
    status: "idle",
  });
  const [pageIndex, setPageIndex] = useState(0);
  const [pageTokens, setPageTokens] = useState<Array<string | null>>([null]);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [sendNotice, setSendNotice] = useState<string | null>(null);
  const detailCache = useRef(new Map<string, GmailMessageDetail>());

  const loadInbox = useCallback(
    async (pageToken: string | null, signal?: AbortSignal) => {
      try {
        const query = pageToken
          ? `?${new URLSearchParams({ pageToken }).toString()}`
          : "";
        const response = await fetch(`/api/gmail/inbox${query}`, {
          method: "GET",
          cache: "no-store",
          signal,
        });
        const payload = (await response.json()) as GmailInboxResponse;

        if (!response.ok || !payload.success) {
          throw payload;
        }

        setState({ status: "success", data: payload.data });
        setSelectedMessageId(payload.data.messages[0]?.id ?? null);
      } catch (error) {
        if (signal?.aborted) {
          return;
        }

        const payload = error as Partial<
          Extract<GmailInboxResponse, { success: false }>
        >;
        setState((current) => ({
          status: "error",
          message: payload.error ?? "Impossible de charger Gmail pour le moment.",
          reconnect:
            payload.code === "RECONNECT_REQUIRED" ||
            payload.code === "UNAUTHENTICATED",
          data: current.data,
        }));
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    // La réponse de Gmail met ensuite à jour l'état asynchrone du composant.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadInbox(null, controller.signal);
    return () => controller.abort();
  }, [loadInbox]);

  useEffect(() => {
    if (!selectedMessageId) {
      return;
    }

    const cachedMessage = detailCache.current.get(selectedMessageId);
    if (cachedMessage) {
      setDetailState({ status: "success", data: cachedMessage });
      return;
    }

    const controller = new AbortController();
    setDetailState({ status: "loading" });

    async function loadMessage() {
      try {
        const response = await fetch(
          `/api/gmail/messages/${encodeURIComponent(selectedMessageId!)}`,
          { cache: "no-store", signal: controller.signal },
        );
        const payload = (await response.json()) as GmailMessageResponse;

        if (!response.ok || !payload.success) {
          throw payload;
        }

        detailCache.current.set(payload.data.id, payload.data);
        setDetailState({ status: "success", data: payload.data });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        const payload = error as Partial<
          Extract<GmailMessageResponse, { success: false }>
        >;
        setDetailState({
          status: "error",
          message:
            payload.error ?? "Le contenu complet de cet email est indisponible.",
        });
      }
    }

    void loadMessage();
    return () => controller.abort();
  }, [selectedMessageId]);

  const data = state.data;
  const selectedMessage = useMemo(
    () =>
      data?.messages.find((message) => message.id === selectedMessageId) ??
      data?.messages[0] ??
      null,
    [data, selectedMessageId],
  );
  const unreadLoaded =
    data?.messages.filter((message) => message.isUnread).length ?? 0;
  const isLoading = state.status === "loading";

  const changePage = useCallback(
    (nextIndex: number, token: string | null) => {
      setState((current) => ({ status: "loading", data: current.data }));
      setPageIndex(nextIndex);
      void loadInbox(token);
    },
    [loadInbox],
  );

  const showNextPage = useCallback(() => {
    if (!data?.nextPageToken || isLoading) {
      return;
    }
    const nextIndex = pageIndex + 1;
    setPageTokens((current) => [
      ...current.slice(0, nextIndex),
      data.nextPageToken ?? null,
    ]);
    changePage(nextIndex, data.nextPageToken);
  }, [changePage, data, isLoading, pageIndex]);

  const showPreviousPage = useCallback(() => {
    if (pageIndex === 0 || isLoading) {
      return;
    }
    const previousIndex = pageIndex - 1;
    changePage(previousIndex, pageTokens[previousIndex] ?? null);
  }, [changePage, isLoading, pageIndex, pageTokens]);

  const refreshInbox = useCallback(() => {
    if (isLoading) {
      return;
    }
    setState((current) => ({ status: "loading", data: current.data }));
    detailCache.current.clear();
    void loadInbox(pageTokens[pageIndex] ?? null);
  }, [isLoading, loadInbox, pageIndex, pageTokens]);

  const sendMessage = useCallback(async (message: ComposerMessage) => {
    const response = await fetch("/api/gmail/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
    const payload = (await response
      .json()
      .catch(() => null)) as GmailSendResponse | null;

    if (!payload || !response.ok || !payload.success) {
      throw new Error(
        payload && !payload.success
          ? payload.error
          : "La réponse de Gmail est incomplète.",
      );
    }

    setIsComposerOpen(false);
    setSendNotice(
      `Message envoyé avec succès à ${message.to}. Identifiant Gmail : ${payload.data.messageId}`,
    );
  }, []);

  return (
    <div className="min-h-screen bg-[#f4f4f5] text-[#18181b]">
      <a
        href="#gmail-content"
        className="fixed left-4 top-4 z-50 -translate-y-24 rounded-lg bg-[#18181b] px-4 py-3 text-sm font-semibold text-white transition-transform focus:translate-y-0"
      >
        Aller au contenu principal
      </a>

      <header className="border-b border-[#e4e4e7] bg-white">
        <div className="mx-auto flex min-h-18 max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#18181b] text-white">
              <MailboxIcon name="mail" className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold tracking-[-0.02em]">
                Email Organizer AI
              </p>
              <p className="truncate text-xs text-[#52525b]">
                {user.name || user.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 sm:inline-flex">
              <span className="size-2 rounded-full bg-emerald-600" />
              Gmail connecté
            </span>
            <form action={signOutFromApp}>
              <button
                type="submit"
                className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-[#d4d4d8] bg-white px-3 text-sm font-semibold text-[#3f3f46] transition-colors duration-200 hover:bg-[#f4f4f5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18181b]"
              >
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>

      <main
        id="gmail-content"
        className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#2563eb]">
              Lecture réelle de Gmail
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
              Boîte de réception
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#52525b] sm:text-base">
              Parcourez les messages par pages et ouvrez leur contenu complet.
              Cette étape reste en lecture seule.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button
              type="button"
              onClick={() => {
                setSendNotice(null);
                setIsComposerOpen(true);
              }}
              className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#2563eb] px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[#1d4ed8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18181b]"
            >
              <MailboxIcon name="compose" className="size-4" />
              Nouveau message
            </button>
            <button
              type="button"
              onClick={refreshInbox}
              disabled={isLoading}
              className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#d4d4d8] bg-white px-4 text-sm font-semibold text-[#3f3f46] transition-colors duration-200 hover:bg-[#f4f4f5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18181b] disabled:cursor-wait disabled:opacity-60"
            >
              <MailboxIcon name="refresh" className="size-4" />
              {isLoading ? "Actualisation…" : "Actualiser"}
            </button>
          </div>
        </div>

        {sendNotice ? (
          <section
            aria-live="polite"
            className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"
          >
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-white">
              <MailboxIcon name="check" className="size-4" />
            </div>
            <div>
              <p className="font-semibold">Email remis à Gmail</p>
              <p className="mt-1 break-words text-sm leading-6">
                {sendNotice}
              </p>
            </div>
          </section>
        ) : null}

        {state.status === "error" ? (
          <section
            aria-live="assertive"
            className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 sm:flex sm:items-center sm:justify-between sm:gap-4"
          >
            <div>
              <p className="font-semibold text-red-900">
                Gmail n’a pas pu être chargé
              </p>
              <p className="mt-1 text-sm leading-6 text-red-800">
                {state.message}
              </p>
            </div>
            {state.reconnect ? (
              <form action={signInWithGoogle} className="mt-4 sm:mt-0">
                <button
                  type="submit"
                  className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl bg-red-800 px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-red-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18181b]"
                >
                  Reconnecter Google
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={refreshInbox}
                className="mt-4 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-red-300 bg-white px-4 text-sm font-semibold text-red-900 transition-colors duration-200 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18181b] sm:mt-0"
              >
                Réessayer
              </button>
            )}
          </section>
        ) : null}

        {data ? (
          <section
            aria-label="Statistiques Gmail"
            className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4"
          >
            {[
              {
                label: "Boîte complète",
                value: data.mailboxMessageCount,
                detail: "Messages Gmail",
              },
              {
                label: "Réception",
                value: data.inboxEstimate,
                detail: "Estimation Gmail",
              },
              {
                label: "Page affichée",
                value: pageIndex + 1,
                detail: `${data.messages.length} messages`,
              },
              {
                label: "Non lus sur la page",
                value: unreadLoaded,
                detail: "À consulter",
              },
            ].map((stat) => (
              <article
                key={stat.label}
                className="rounded-2xl border border-[#e4e4e7] bg-white p-4 sm:p-5"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#71717a]">
                  {stat.label}
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                  {stat.value.toLocaleString("fr-FR")}
                </p>
                <p className="mt-1 text-xs text-[#52525b]">{stat.detail}</p>
              </article>
            ))}
          </section>
        ) : null}

        <section
          aria-label="Messages Gmail"
          className="mt-6 overflow-hidden rounded-2xl border border-[#e4e4e7] bg-white"
        >
          {isLoading && !data ? <LoadingInbox /> : null}
          {data && data.messages.length === 0 ? <EmptyInbox /> : null}
          {data && data.messages.length > 0 ? (
            <>
              <div className="grid min-h-[600px] lg:grid-cols-[minmax(320px,440px)_minmax(0,1fr)]">
                <div className="max-h-[620px] overflow-y-auto border-b border-[#e4e4e7] lg:max-h-[780px] lg:border-b-0 lg:border-r">
                  <div className="sticky top-0 z-10 border-b border-[#e4e4e7] bg-white px-4 py-3 sm:px-5">
                    <p className="text-sm font-semibold">
                      Page {pageIndex + 1} · {data.messages.length} messages
                    </p>
                    <p className="mt-0.5 text-xs text-[#52525b]">
                      Actualisé à{" "}
                      {new Date(data.syncedAt).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  {data.messages.map((message) => (
                    <MessageRow
                      key={message.id}
                      message={message}
                      selected={message.id === selectedMessage?.id}
                      onSelect={() => {
                        setDetailState({ status: "loading" });
                        setSelectedMessageId(message.id);
                      }}
                    />
                  ))}
                </div>
                <div className="min-w-0">
                  <MessagePreview
                    message={selectedMessage}
                    detail={detailState}
                  />
                </div>
              </div>

              <nav
                aria-label="Pagination de la boîte de réception"
                className="flex items-center justify-between gap-3 border-t border-[#e4e4e7] bg-[#fafafa] p-3 sm:px-5"
              >
                <button
                  type="button"
                  onClick={showPreviousPage}
                  disabled={pageIndex === 0 || isLoading}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[#d4d4d8] bg-white px-4 text-sm font-semibold text-[#3f3f46] transition-colors duration-200 hover:bg-[#f4f4f5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <MailboxIcon
                    name="chevron"
                    className="size-4 rotate-90"
                  />
                  <span className="hidden sm:inline">Page précédente</span>
                  <span className="sm:hidden">Précédente</span>
                </button>
                <span className="text-sm font-semibold text-[#52525b]">
                  Page {pageIndex + 1}
                </span>
                <button
                  type="button"
                  onClick={showNextPage}
                  disabled={!data.hasMore || isLoading}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[#d4d4d8] bg-white px-4 text-sm font-semibold text-[#3f3f46] transition-colors duration-200 hover:bg-[#f4f4f5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="hidden sm:inline">Page suivante</span>
                  <span className="sm:hidden">Suivante</span>
                  <MailboxIcon
                    name="chevron"
                    className="size-4 -rotate-90"
                  />
                </button>
              </nav>
            </>
          ) : null}
        </section>
      </main>

      {isComposerOpen ? (
        <EmailComposer
          deliveryMode="gmail"
          senderEmail={user.email}
          session={{
            mode: "compose",
            to: "",
            cc: "",
            bcc: "",
            subject: "",
            body: "",
          }}
          onClose={() => setIsComposerOpen(false)}
          onSend={sendMessage}
        />
      ) : null}
    </div>
  );
}
