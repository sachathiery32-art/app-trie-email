"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  signInWithGoogle,
  signOutFromApp,
} from "@/app/actions/auth";
import { MailboxIcon } from "@/components/mailbox-icon";
import type {
  GmailInboxData,
  GmailInboxResponse,
  GmailMessageSummary,
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
            className="h-24 animate-pulse rounded-2xl bg-[#f1f1f3]"
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
        Aucun message dans la boîte de réception
      </h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-[#52525b]">
        La connexion Gmail fonctionne, mais aucun message ne correspond à cette
        première vue.
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

function MessagePreview({ message }: { message: GmailMessageSummary | null }) {
  if (!message) {
    return (
      <div className="flex min-h-96 items-center justify-center p-8 text-center text-sm text-[#71717a]">
        Sélectionnez un message pour afficher son aperçu.
      </div>
    );
  }

  return (
    <article className="p-5 sm:p-8">
      <div className="flex flex-wrap items-center gap-2">
        {message.isUnread ? (
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">
            Non lu
          </span>
        ) : (
          <span className="rounded-full bg-[#f1f1f3] px-2.5 py-1 text-xs font-semibold text-[#52525b]">
            Lu
          </span>
        )}
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
        <dt className="font-semibold text-[#52525b]">Reçu</dt>
        <dd className="text-[#18181b]">
          <time dateTime={new Date(message.receivedAt).toISOString()}>
            {formatFullDate(message.receivedAt)}
          </time>
        </dd>
      </dl>

      <div className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#71717a]">
          Aperçu Gmail
        </p>
        <p className="mt-4 whitespace-pre-wrap text-base leading-7 text-[#27272a]">
          {message.snippet}
        </p>
        <p className="mt-8 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
          Lecture seule active : le contenu complet et les actions arriveront
          après validation de cette première synchronisation.
        </p>
      </div>
    </article>
  );
}

export function GmailInbox({ user }: { user: AuthenticatedUser }) {
  const [state, setState] = useState<InboxState>({ status: "loading" });
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    null,
  );

  const loadInbox = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/gmail/inbox", {
        method: "GET",
        cache: "no-store",
        signal,
      });
      const payload = (await response.json()) as GmailInboxResponse;

      if (!response.ok || !payload.success) {
        throw payload;
      }

      setState({ status: "success", data: payload.data });
      setSelectedMessageId((currentId) =>
        payload.data.messages.some((message) => message.id === currentId)
          ? currentId
          : (payload.data.messages[0]?.id ?? null),
      );
    } catch (error) {
      if (signal?.aborted) {
        return;
      }

      const payload = error as Partial<Extract<GmailInboxResponse, { success: false }>>;
      setState((current) => ({
        status: "error",
        message:
          payload.error ?? "Impossible de charger Gmail pour le moment.",
        reconnect:
          payload.code === "RECONNECT_REQUIRED" ||
          payload.code === "UNAUTHENTICATED",
        data: current.data,
      }));
    }
  }, []);

  const refreshInbox = useCallback(() => {
    setState((current) => ({
      status: "loading",
      data: current.data,
    }));
    void loadInbox();
  }, [loadInbox]);

  useEffect(() => {
    const controller = new AbortController();
    // La réponse du système externe Gmail met ensuite à jour l'état asynchrone.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadInbox(controller.signal);
    return () => controller.abort();
  }, [loadInbox]);

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
              Première synchronisation réelle
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
              Boîte de réception Gmail
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#52525b] sm:text-base">
              Les 20 messages les plus récents sont chargés directement depuis
              Gmail. Cette étape est strictement en lecture seule.
            </p>
          </div>
          <button
            type="button"
            onClick={refreshInbox}
            disabled={state.status === "loading"}
            className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#2563eb] px-5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[#1d4ed8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18181b] disabled:cursor-wait disabled:bg-[#93c5fd]"
          >
            <MailboxIcon name="refresh" className="size-4" />
            {state.status === "loading" ? "Actualisation…" : "Actualiser Gmail"}
          </button>
        </div>

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
                label: "Chargés",
                value: data.messages.length,
                detail: data.hasMore ? "Première page" : "Tous affichés",
              },
              {
                label: "Non lus chargés",
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
          {state.status === "loading" && !data ? <LoadingInbox /> : null}
          {data && data.messages.length === 0 ? <EmptyInbox /> : null}
          {data && data.messages.length > 0 ? (
            <div className="grid min-h-[600px] lg:grid-cols-[minmax(320px,440px)_minmax(0,1fr)]">
              <div className="max-h-[720px] overflow-y-auto border-b border-[#e4e4e7] lg:border-b-0 lg:border-r">
                <div className="sticky top-0 z-10 border-b border-[#e4e4e7] bg-white px-4 py-3 sm:px-5">
                  <p className="text-sm font-semibold">
                    {data.messages.length} messages récents
                  </p>
                  <p className="mt-0.5 text-xs text-[#52525b]">
                    Actualisé à {new Date(data.syncedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                {data.messages.map((message) => (
                  <MessageRow
                    key={message.id}
                    message={message}
                    selected={message.id === selectedMessage?.id}
                    onSelect={() => setSelectedMessageId(message.id)}
                  />
                ))}
              </div>
              <div className="min-w-0">
                <MessagePreview message={selectedMessage} />
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
