"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { signInWithGoogle, signOutFromApp } from "@/app/actions/auth";
import { EmailComposer } from "@/components/email-composer";
import { GmailAiAssistant } from "@/components/gmail-ai-assistant";
import { GmailAiCommandCenter } from "@/components/gmail-ai-command-center";
import { GmailAttachmentCard } from "@/components/gmail-attachment-card";
import {
  MailboxIcon,
  type MailboxIconName,
} from "@/components/mailbox-icon";
import type {
  AiUserPreferences,
  GmailAiTriageItem,
  GmailAiTriageResponse,
} from "@/types/ai";
import type { ComposerMessage, ComposerMode, ComposerSession } from "@/types/email";
import type {
  GmailInboxData,
  GmailInboxResponse,
  GmailLabelSummary,
  GmailMailboxView,
  GmailMessageDetail,
  GmailMessageResponse,
  GmailMessageSummary,
  GmailModifyAction,
  GmailModifyResponse,
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

type Notice = { tone: "success" | "error" | "info"; message: string };

const AI_PREFERENCES_KEY = "email-organizer-ai-preferences-v1";

const VIEW_ITEMS: Array<{
  value: GmailMailboxView;
  label: string;
  icon: MailboxIconName;
  systemLabel?: string;
}> = [
  { value: "inbox", label: "Réception", icon: "inbox", systemLabel: "INBOX" },
  { value: "starred", label: "Favoris", icon: "star", systemLabel: "STARRED" },
  { value: "sent", label: "Envoyés", icon: "send", systemLabel: "SENT" },
  { value: "drafts", label: "Brouillons", icon: "draft", systemLabel: "DRAFT" },
  { value: "archive", label: "Archives", icon: "archive" },
  { value: "trash", label: "Corbeille", icon: "trash", systemLabel: "TRASH" },
  { value: "all", label: "Tous les messages", icon: "mail" },
];

function formatMessageDate(timestamp: number) {
  const date = new Date(timestamp);
  const today = new Date();
  return new Intl.DateTimeFormat("fr-FR", {
    ...(date.toDateString() === today.toDateString()
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

function withSubjectPrefix(subject: string, prefix: "Re" | "Tr") {
  const expression = prefix === "Re" ? /^re\s*:/i : /^(fwd?|tr)\s*:/i;
  return expression.test(subject) ? subject : `${prefix}: ${subject}`;
}

function extractAddresses(value: string) {
  return value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
}

function uniqueAddresses(values: string[], excluded: string[] = []) {
  const excludedSet = new Set(excluded.map((value) => value.toLowerCase()));
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.toLowerCase();
    if (seen.has(normalized) || excludedSet.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function quotedMessage(message: GmailMessageDetail) {
  const quotedBody = message.bodyText
    .slice(0, 12_000)
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return `\n\nLe ${formatFullDate(message.receivedAt)}, ${message.senderName} a écrit :\n${quotedBody}`;
}

function createComposerSession(
  mode: Extract<ComposerMode, "reply" | "replyAll" | "forward">,
  message: GmailMessageDetail,
  accountEmail: string,
): ComposerSession {
  if (mode === "forward") {
    return {
      mode,
      sourceEmailId: message.id,
      to: "",
      cc: "",
      bcc: "",
      subject: withSubjectPrefix(message.subject, "Tr"),
      body: `\n\n---------- Message transféré ----------\nDe : ${message.senderName} <${message.senderEmail}>\nDate : ${formatFullDate(message.receivedAt)}\nObjet : ${message.subject}\nÀ : ${message.recipients}\n\n${message.bodyText.slice(0, 12_000)}`,
    };
  }

  const replyAddress =
    extractAddresses(message.replyTo)[0] || message.senderEmail;
  const allOriginalRecipients = uniqueAddresses(
    [
      ...extractAddresses(message.recipients),
      ...extractAddresses(message.cc),
    ],
    [accountEmail, replyAddress],
  );

  return {
    mode,
    sourceEmailId: message.id,
    to: replyAddress,
    cc: mode === "replyAll" ? allOriginalRecipients.join(", ") : "",
    bcc: "",
    subject: withSubjectPrefix(message.subject, "Re"),
    body: quotedMessage(message),
  };
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
  danger = false,
}: {
  icon: MailboxIconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-50 ${
        danger
          ? "border-red-200 bg-white text-red-800 hover:bg-red-50 focus-visible:outline-red-800"
          : "border-[#d4d4d8] bg-white text-[#3f3f46] hover:bg-[#f4f4f5] focus-visible:outline-[#2563eb]"
      }`}
    >
      <MailboxIcon name={icon} className="size-4" />
      {label}
    </button>
  );
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
        <time className="shrink-0 text-xs font-medium text-[#52525b]">
          {formatMessageDate(message.receivedAt)}
        </time>
      </div>
      <div className="mt-2 flex items-center gap-2">
        {message.isStarred ? (
          <MailboxIcon name="star" className="size-4 shrink-0 text-amber-600" />
        ) : null}
        <p className="truncate text-sm font-semibold text-[#27272a]">
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
  accountEmail,
  currentView,
  labels,
  actionPending,
  onCompose,
  onAction,
  onRefresh,
}: {
  message: GmailMessageSummary | null;
  detail: DetailState;
  accountEmail: string;
  currentView: GmailMailboxView;
  labels: GmailLabelSummary[];
  actionPending: boolean;
  onCompose: (session: ComposerSession) => void;
  onAction: (action: GmailModifyAction, labelId?: string) => void;
  onRefresh: () => void;
}) {
  if (!message) {
    return (
      <div className="flex min-h-96 items-center justify-center p-8 text-center text-sm text-[#71717a]">
        Sélectionnez un message pour afficher son contenu.
      </div>
    );
  }

  const complete =
    detail.status === "success" && detail.data.id === message.id
      ? detail.data
      : null;
  const userLabels = labels.filter((label) => label.type === "user");
  const appliedUserLabels = userLabels.filter((label) =>
    message.labelIds.includes(label.id),
  );
  const availableUserLabels = userLabels.filter(
    (label) => !message.labelIds.includes(label.id),
  );
  const canReply = Boolean(complete && currentView !== "sent" && currentView !== "drafts");

  return (
    <article className="p-5 sm:p-7">
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
        {appliedUserLabels.map((label) => (
          <button
            key={label.id}
            type="button"
            onClick={() => onAction("remove_label", label.id)}
            disabled={actionPending}
            title="Retirer ce libellé"
            className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-full border border-[#d4d4d8] bg-white px-2.5 text-xs font-semibold text-[#52525b] hover:bg-red-50 hover:text-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] disabled:opacity-50"
          >
            {label.name} <span aria-hidden="true">×</span>
          </button>
        ))}
      </div>

      <h2 className="mt-5 text-2xl font-semibold tracking-[-0.025em] text-[#18181b] sm:text-3xl">
        {message.subject}
      </h2>

      <div className="mt-5 flex flex-wrap gap-2" aria-label="Actions du message">
        {canReply && complete ? (
          <>
            <ActionButton
              icon="reply"
              label="Répondre"
              onClick={() =>
                onCompose(createComposerSession("reply", complete, accountEmail))
              }
            />
            <ActionButton
              icon="reply"
              label="Répondre à tous"
              onClick={() =>
                onCompose(createComposerSession("replyAll", complete, accountEmail))
              }
            />
          </>
        ) : null}
        {complete ? (
          <ActionButton
            icon="forward"
            label="Transférer"
            onClick={() =>
              onCompose(createComposerSession("forward", complete, accountEmail))
            }
          />
        ) : null}
        <ActionButton
          icon="check"
          label={message.isUnread ? "Marquer lu" : "Marquer non lu"}
          disabled={actionPending}
          onClick={() =>
            onAction(message.isUnread ? "mark_read" : "mark_unread")
          }
        />
        <ActionButton
          icon="star"
          label={message.isStarred ? "Retirer favori" : "Favori"}
          disabled={actionPending}
          onClick={() => onAction(message.isStarred ? "unstar" : "star")}
        />
        {currentView === "trash" ? (
          <ActionButton
            icon="restore"
            label="Restaurer"
            disabled={actionPending}
            onClick={() => onAction("restore")}
          />
        ) : (
          <>
            {message.labelIds.includes("INBOX") ? (
              <ActionButton
                icon="archive"
                label="Archiver"
                disabled={actionPending}
                onClick={() => onAction("archive")}
              />
            ) : null}
            <ActionButton
              icon="trash"
              label="Corbeille"
              danger
              disabled={actionPending}
              onClick={() => onAction("trash")}
            />
          </>
        )}
      </div>

      {availableUserLabels.length ? (
        <div className="mt-3 max-w-sm">
          <label htmlFor="gmail-label-select" className="sr-only">
            Ajouter un libellé Gmail
          </label>
          <select
            id="gmail-label-select"
            defaultValue=""
            disabled={actionPending}
            onChange={(event) => {
              if (event.target.value) onAction("add_label", event.target.value);
              event.target.value = "";
            }}
            className="min-h-11 w-full cursor-pointer rounded-xl border border-[#d4d4d8] bg-white px-3 text-sm font-semibold text-[#3f3f46] outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] disabled:opacity-50"
          >
            <option value="">Ajouter un libellé…</option>
            {availableUserLabels.map((label) => (
              <option key={label.id} value={label.id}>
                {label.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <dl className="mt-6 grid gap-3 rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-4 text-sm sm:grid-cols-[100px_1fr]">
        <dt className="font-semibold text-[#52525b]">De</dt>
        <dd className="min-w-0 break-words text-[#18181b]">
          {message.senderName} {message.senderEmail ? `<${message.senderEmail}>` : ""}
        </dd>
        <dt className="font-semibold text-[#52525b]">À</dt>
        <dd className="min-w-0 break-words text-[#18181b]">
          {message.recipients || "Destinataire non indiqué"}
        </dd>
        {complete?.cc ? (
          <>
            <dt className="font-semibold text-[#52525b]">Copie</dt>
            <dd className="min-w-0 break-words text-[#18181b]">{complete.cc}</dd>
          </>
        ) : null}
        <dt className="font-semibold text-[#52525b]">Date</dt>
        <dd className="text-[#18181b]">{formatFullDate(message.receivedAt)}</dd>
      </dl>

      <div className="mt-8" aria-live="polite">
        {detail.status === "loading" || detail.status === "idle" ? (
          <div className="space-y-3" aria-busy="true">
            <div className="h-4 w-full animate-pulse rounded bg-[#e4e4e7] motion-reduce:animate-none" />
            <div className="h-4 w-11/12 animate-pulse rounded bg-[#e4e4e7] motion-reduce:animate-none" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-[#e4e4e7] motion-reduce:animate-none" />
          </div>
        ) : null}
        {detail.status === "error" ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {detail.message}
          </p>
        ) : null}
        {complete ? (
          <div className="whitespace-pre-wrap break-words text-base leading-7 text-[#27272a]">
            {complete.bodyText}
          </div>
        ) : null}

        {complete ? (
          <GmailAiAssistant
            key={complete.id}
            message={complete}
            onUseReply={(body) => {
              const session = createComposerSession("reply", complete, accountEmail);
              onCompose({ ...session, body });
            }}
            onLabelsApplied={onRefresh}
          />
        ) : null}

        {complete?.attachments.length ? (
          <section className="mt-8 border-t border-[#e4e4e7] pt-6">
            <h3 className="text-sm font-semibold text-[#18181b]">
              Pièces jointes ({complete.attachments.length})
            </h3>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {complete.attachments.map((attachment, index) => (
                <GmailAttachmentCard
                  key={`${attachment.filename}-${index}`}
                  messageId={complete.id}
                  attachment={attachment}
                />
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </article>
  );
}

export function GmailInbox({ user }: { user: AuthenticatedUser }) {
  const [state, setState] = useState<InboxState>({ status: "loading" });
  const [currentView, setCurrentView] = useState<GmailMailboxView>("inbox");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [detailState, setDetailState] = useState<DetailState>({ status: "idle" });
  const [pageIndex, setPageIndex] = useState(0);
  const [pageTokens, setPageTokens] = useState<Array<string | null>>([null]);
  const [composerSession, setComposerSession] = useState<ComposerSession | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [isTriageRunning, setIsTriageRunning] = useState(false);
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);
  const [aiPreferences, setAiPreferences] = useState<AiUserPreferences>({
    autoTriage: false,
    writingStyle: "",
  });
  const detailCache = useRef(new Map<string, GmailMessageDetail>());
  const inboxRequestSequence = useRef(0);
  const triageInFlight = useRef(false);
  const autoTriageSeen = useRef(new Set<string>());

  const loadInbox = useCallback(
    async (
      pageToken: string | null,
      options?: { signal?: AbortSignal; silent?: boolean },
    ) => {
      const requestId = ++inboxRequestSequence.current;
      if (options?.silent) {
        setIsSyncing(true);
      } else {
        setState((current) => ({ status: "loading", data: current.data }));
      }

      try {
        const query = new URLSearchParams({ view: currentView });
        if (pageToken) query.set("pageToken", pageToken);
        if (search) query.set("q", search);
        const response = await fetch(`/api/gmail/inbox?${query}`, {
          method: "GET",
          cache: "no-store",
          signal: options?.signal,
        });
        const payload = (await response.json()) as GmailInboxResponse;
        if (!response.ok || !payload.success) throw payload;
        if (requestId !== inboxRequestSequence.current) return;

        setState({ status: "success", data: payload.data });
        setSelectedMessageId((current) =>
          payload.data.messages.some((message) => message.id === current)
            ? current
            : (payload.data.messages[0]?.id ?? null),
        );
      } catch (error) {
        if (
          options?.signal?.aborted ||
          requestId !== inboxRequestSequence.current
        ) {
          return;
        }
        const payload = error as Partial<Extract<GmailInboxResponse, { success: false }>>;
        setState((current) => ({
          status: "error",
          message: payload.error ?? "Impossible de charger Gmail pour le moment.",
          reconnect:
            payload.code === "RECONNECT_REQUIRED" ||
            payload.code === "UNAUTHENTICATED",
          data: current.data,
        }));
      } finally {
        if (requestId === inboxRequestSequence.current) {
          setIsSyncing(false);
        }
      }
    },
    [currentView, search],
  );

  useEffect(() => {
    const controller = new AbortController();
    // Chargement asynchrone déclenché lorsque la vue ou la recherche change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadInbox(null, { signal: controller.signal });
    return () => controller.abort();
  }, [loadInbox]);

  useEffect(() => {
    const synchronize = () => {
      if (document.visibilityState === "visible") {
        void loadInbox(pageTokens[pageIndex] ?? null, { silent: true });
      }
    };
    const intervalId = window.setInterval(synchronize, 60_000);
    document.addEventListener("visibilitychange", synchronize);
    window.addEventListener("focus", synchronize);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", synchronize);
      window.removeEventListener("focus", synchronize);
    };
  }, [loadInbox, pageIndex, pageTokens]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(AI_PREFERENCES_KEY);
        if (stored) {
          const value = JSON.parse(stored) as Partial<AiUserPreferences>;
          setAiPreferences({
            autoTriage: value.autoTriage === true,
            writingStyle:
              typeof value.writingStyle === "string"
                ? value.writingStyle.slice(0, 500)
                : "",
          });
        }
      } catch {
        window.localStorage.removeItem(AI_PREFERENCES_KEY);
      } finally {
        setPreferencesHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!preferencesHydrated) return;
    window.localStorage.setItem(AI_PREFERENCES_KEY, JSON.stringify(aiPreferences));
  }, [aiPreferences, preferencesHydrated]);

  useEffect(() => {
    if (!selectedMessageId) {
      return;
    }
    let active = true;
    const cached = detailCache.current.get(selectedMessageId);
    if (cached) {
      queueMicrotask(() => {
        if (active) setDetailState({ status: "success", data: cached });
      });
      return () => {
        active = false;
      };
    }

    const controller = new AbortController();
    queueMicrotask(() => {
      if (active) setDetailState({ status: "loading" });
    });
    void (async () => {
      try {
        const response = await fetch(
          `/api/gmail/messages/${encodeURIComponent(selectedMessageId)}`,
          { cache: "no-store", signal: controller.signal },
        );
        const payload = (await response.json()) as GmailMessageResponse;
        if (!response.ok || !payload.success) throw payload;
        detailCache.current.set(payload.data.id, payload.data);
        setDetailState({ status: "success", data: payload.data });
      } catch (error) {
        if (controller.signal.aborted) return;
        const payload = error as Partial<Extract<GmailMessageResponse, { success: false }>>;
        setDetailState({
          status: "error",
          message: payload.error ?? "Le contenu complet de cet email est indisponible.",
        });
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedMessageId]);

  const data = state.data;
  const selectedMessage = useMemo(
    () => data?.messages.find((message) => message.id === selectedMessageId) ?? null,
    [data, selectedMessageId],
  );
  const isLoading = state.status === "loading";

  function selectView(view: GmailMailboxView) {
    if (view === currentView) return;
    setCurrentView(view);
    setPageIndex(0);
    setPageTokens([null]);
    setSelectedMessageId(null);
    setDetailState({ status: "idle" });
    setNotice(null);
    detailCache.current.clear();
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPageIndex(0);
    setPageTokens([null]);
    setSelectedMessageId(null);
    detailCache.current.clear();
  }

  const refreshInbox = useCallback(() => {
    detailCache.current.clear();
    void loadInbox(pageTokens[pageIndex] ?? null);
  }, [loadInbox, pageIndex, pageTokens]);

  const runAiTriage = useCallback(
    async (
      messageIds: string[],
      options?: { automatic?: boolean },
    ): Promise<GmailAiTriageItem[]> => {
      if (triageInFlight.current) {
        throw new Error("Un classement IA est déjà en cours.");
      }
      const ids = [...new Set(messageIds)].slice(0, 10);
      if (!ids.length) return [];

      triageInFlight.current = true;
      setIsTriageRunning(true);
      try {
        const response = await fetch("/api/gmail/ai/triage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageIds: ids, applyLabels: true }),
        });
        const payload = (await response.json()) as GmailAiTriageResponse;
        if (!response.ok || !payload.success) {
          throw new Error(payload.success ? "Classement incomplet." : payload.error);
        }

        detailCache.current.clear();
        setNotice({
          tone: "success",
          message: options?.automatic
            ? `${payload.data.items.length} nouveau(x) message(s) classé(s) automatiquement.`
            : `${payload.data.items.length} message(s) classé(s) et synchronisé(s) avec Gmail.`,
        });
        await loadInbox(pageTokens[pageIndex] ?? null, { silent: true });
        return payload.data.items;
      } finally {
        triageInFlight.current = false;
        setIsTriageRunning(false);
      }
    },
    [loadInbox, pageIndex, pageTokens],
  );

  useEffect(() => {
    if (
      !preferencesHydrated ||
      !aiPreferences.autoTriage ||
      state.status !== "success" ||
      currentView !== "inbox" ||
      isTriageRunning
    ) {
      return;
    }

    const categoryLabelIds = new Set(
      state.data.labels
        .filter((label) => label.name.startsWith("AI/Catégorie/"))
        .map((label) => label.id),
    );
    const candidates = state.data.messages
      .filter(
        (message) =>
          message.labelIds.includes("INBOX") &&
          !message.labelIds.some((labelId) => categoryLabelIds.has(labelId)) &&
          !autoTriageSeen.current.has(message.id),
      )
      .slice(0, 5)
      .map((message) => message.id);
    if (!candidates.length) return;

    candidates.forEach((id) => autoTriageSeen.current.add(id));
    const timeoutId = window.setTimeout(() => {
      void runAiTriage(candidates, { automatic: true }).catch((error) => {
        candidates.forEach((id) => autoTriageSeen.current.delete(id));
        setNotice({
          tone: "error",
          message:
            error instanceof Error
              ? error.message
              : "Le tri automatique n’a pas pu être effectué.",
        });
      });
    }, 600);
    return () => window.clearTimeout(timeoutId);
  }, [
    aiPreferences.autoTriage,
    currentView,
    isTriageRunning,
    preferencesHydrated,
    runAiTriage,
    state,
  ]);

  function applyGmailQuery(query: string) {
    const cleanQuery = query.trim();
    if (!cleanQuery) return;
    setCurrentView("all");
    setSearchInput(cleanQuery);
    setSearch(cleanQuery);
    setPageIndex(0);
    setPageTokens([null]);
    setSelectedMessageId(null);
    setDetailState({ status: "idle" });
    detailCache.current.clear();
  }

  async function performAction(action: GmailModifyAction, labelId?: string) {
    if (!selectedMessage || actionPending) return;
    setActionPending(true);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/gmail/messages/${encodeURIComponent(selectedMessage.id)}/modify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, labelId }),
        },
      );
      const payload = (await response.json()) as GmailModifyResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.success ? "Action incomplète." : payload.error);
      }

      detailCache.current.delete(selectedMessage.id);
      setNotice({ tone: "success", message: "La modification est synchronisée avec Gmail." });
      await loadInbox(pageTokens[pageIndex] ?? null);
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Gmail n’a pas pu appliquer cette action.",
      });
    } finally {
      setActionPending(false);
    }
  }

  const sendMessage = useCallback(
    async (message: ComposerMessage, attachments: File[]) => {
      if (!composerSession) throw new Error("La fenêtre de rédaction a expiré.");
      const formData = new FormData();
      formData.set(
        "mode",
        composerSession.mode === "draft" ? "compose" : composerSession.mode,
      );
      if (composerSession.sourceEmailId) {
        formData.set("sourceMessageId", composerSession.sourceEmailId);
      }
      for (const [key, value] of Object.entries(message)) formData.set(key, value);
      for (const attachment of attachments) formData.append("attachments", attachment);

      const response = await fetch("/api/gmail/send", { method: "POST", body: formData });
      const payload = (await response.json().catch(() => null)) as GmailSendResponse | null;
      if (!payload || !response.ok || !payload.success) {
        throw new Error(
          payload && !payload.success ? payload.error : "La réponse de Gmail est incomplète.",
        );
      }

      setComposerSession(null);
      setNotice({
        tone: "success",
        message: `Message remis à Gmail avec succès (identifiant ${payload.data.messageId}).`,
      });
      detailCache.current.clear();
      void loadInbox(pageTokens[pageIndex] ?? null, { silent: true });
    },
    [composerSession, loadInbox, pageIndex, pageTokens],
  );

  function showNextPage() {
    if (!data?.nextPageToken || isLoading) return;
    const nextIndex = pageIndex + 1;
    setPageTokens((current) => [
      ...current.slice(0, nextIndex),
      data.nextPageToken ?? null,
    ]);
    setPageIndex(nextIndex);
    detailCache.current.clear();
    void loadInbox(data.nextPageToken);
  }

  function showPreviousPage() {
    if (pageIndex === 0 || isLoading) return;
    const previousIndex = pageIndex - 1;
    setPageIndex(previousIndex);
    detailCache.current.clear();
    void loadInbox(pageTokens[previousIndex] ?? null);
  }

  const currentViewLabel =
    VIEW_ITEMS.find((item) => item.value === currentView)?.label ?? "Gmail";

  return (
    <div className="min-h-screen bg-[#f4f4f5] text-[#18181b]">
      <a
        href="#gmail-content"
        className="fixed left-4 top-4 z-50 -translate-y-24 rounded-lg bg-[#18181b] px-4 py-3 text-sm font-semibold text-white transition-transform focus:translate-y-0"
      >
        Aller au contenu principal
      </a>

      <header className="border-b border-[#e4e4e7] bg-white">
        <div className="mx-auto flex min-h-18 max-w-[1700px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#18181b] text-white">
              <MailboxIcon name="mail" className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold">Email Organizer AI</p>
              <p className="truncate text-xs text-[#52525b]">{user.name || user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 sm:inline-flex">
              <span className="size-2 rounded-full bg-emerald-600" />
              {isSyncing ? "Synchronisation…" : "Gmail synchronisé"}
            </span>
            <form action={signOutFromApp}>
              <button
                type="submit"
                className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-[#d4d4d8] bg-white px-3 text-sm font-semibold text-[#3f3f46] transition-colors hover:bg-[#f4f4f5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18181b]"
              >
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>

      <main id="gmail-content" className="mx-auto max-w-[1700px] px-3 py-4 sm:px-6 lg:px-8 lg:py-6">
        <div className="grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-[#e4e4e7] bg-white p-3 lg:sticky lg:top-4 lg:self-start">
            <button
              type="button"
              onClick={() =>
                setComposerSession({
                  mode: "compose",
                  to: "",
                  cc: "",
                  bcc: "",
                  subject: "",
                  body: "",
                })
              }
              className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#2563eb] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#1d4ed8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18181b]"
            >
              <MailboxIcon name="compose" className="size-4" />
              Nouveau message
            </button>

            <nav aria-label="Dossiers Gmail" className="mt-3 grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-1">
              {VIEW_ITEMS.map((item) => {
                const label = data?.labels.find((candidate) => candidate.id === item.systemLabel);
                const count =
                  item.value === "all"
                    ? data?.mailboxMessageCount
                    : label?.messagesTotal;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => selectView(item.value)}
                    aria-current={currentView === item.value ? "page" : undefined}
                    className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] ${
                      currentView === item.value
                        ? "bg-[#eff6ff] text-[#1d4ed8]"
                        : "text-[#52525b] hover:bg-[#f4f4f5] hover:text-[#18181b]"
                    }`}
                  >
                    <MailboxIcon name={item.icon} className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                    {typeof count === "number" ? (
                      <span className="ml-auto text-xs tabular-nums">{count}</span>
                    ) : null}
                  </button>
                );
              })}
            </nav>

            {data?.labels.some((label) => label.name.startsWith("AI/Catégorie/")) ? (
              <div className="mt-4 border-t border-[#e4e4e7] pt-4">
                <p className="px-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#71717a]">
                  Catégories IA
                </p>
                <div className="mt-2 grid gap-1">
                  {data.labels
                    .filter((label) => label.name.startsWith("AI/Catégorie/"))
                    .slice(0, 8)
                    .map((label) => (
                      <button
                        key={label.id}
                        type="button"
                        onClick={() => applyGmailQuery(`label:"${label.name}"`)}
                        className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold text-[#52525b] transition-colors hover:bg-[#f4f4f5] hover:text-[#18181b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
                      >
                        <MailboxIcon name="label" className="size-4 shrink-0 text-blue-700" />
                        <span className="truncate">
                          {label.name.replace("AI/Catégorie/", "")}
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            ) : null}

            <div className="mt-4 hidden border-t border-[#e4e4e7] pt-4 text-xs leading-5 text-[#71717a] lg:block">
              <p className="font-semibold text-[#52525b]">Synchronisation automatique</p>
              <p className="mt-1">Toutes les 60 secondes tant que le site est ouvert, puis à chaque retour sur l’onglet.</p>
            </div>
          </aside>

          <div className="min-w-0">
            <section className="rounded-2xl border border-[#e4e4e7] bg-white p-4 sm:p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#2563eb]">Boîte Gmail réelle</p>
                  <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">{currentViewLabel}</h1>
                  <p className="mt-2 text-sm text-[#52525b]">
                    {data
                      ? `${data.viewEstimate.toLocaleString("fr-FR")} message(s) estimé(s) dans cette vue.`
                      : "Chargement de la boîte…"}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <form onSubmit={submitSearch} role="search" className="flex min-w-0 gap-2 sm:min-w-80">
                    <label htmlFor="gmail-search" className="sr-only">Rechercher dans Gmail</label>
                    <div className="relative min-w-0 flex-1">
                      <MailboxIcon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#71717a]" />
                      <input
                        id="gmail-search"
                        value={searchInput}
                        onChange={(event) => setSearchInput(event.target.value)}
                        maxLength={500}
                        placeholder="Rechercher dans Gmail"
                        className="min-h-12 w-full rounded-xl border border-[#d4d4d8] bg-white pl-10 pr-3 text-base outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] sm:text-sm"
                      />
                    </div>
                    <button type="submit" className="min-h-12 cursor-pointer rounded-xl bg-[#18181b] px-4 text-sm font-semibold text-white hover:bg-[#3f3f46] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18181b]">
                      Chercher
                    </button>
                  </form>
                  <button
                    type="button"
                    onClick={refreshInbox}
                    disabled={isLoading || isSyncing}
                    className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#d4d4d8] bg-white px-4 text-sm font-semibold text-[#3f3f46] transition-colors hover:bg-[#f4f4f5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] disabled:cursor-wait disabled:opacity-50"
                  >
                    <MailboxIcon name="refresh" className="size-4" />
                    Actualiser
                  </button>
                </div>
              </div>
              {search ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[#52525b]">
                  <span>Recherche active : <strong>{search}</strong></span>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput("");
                      setSearch("");
                      setPageIndex(0);
                      setPageTokens([null]);
                    }}
                    className="min-h-11 cursor-pointer px-2 font-semibold text-[#2563eb] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
                  >
                    Effacer
                  </button>
                </div>
              ) : null}
            </section>

            <GmailAiCommandCenter
              messages={data?.messages ?? []}
              isTriageRunning={isTriageRunning}
              onTriage={runAiTriage}
              onApplyGmailQuery={applyGmailQuery}
              preferences={aiPreferences}
              onPreferencesChange={setAiPreferences}
            />

            {notice ? (
              <div
                role={notice.tone === "error" ? "alert" : "status"}
                className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${
                  notice.tone === "error"
                    ? "border-red-200 bg-red-50 text-red-900"
                    : notice.tone === "info"
                      ? "border-blue-200 bg-blue-50 text-blue-900"
                      : "border-emerald-200 bg-emerald-50 text-emerald-900"
                }`}
              >
                {notice.message}
              </div>
            ) : null}

            {state.status === "error" ? (
              <section className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
                <div>
                  <p className="font-semibold text-red-900">Gmail n’a pas pu être chargé</p>
                  <p className="mt-1 text-sm text-red-800">{state.message}</p>
                </div>
                {state.reconnect ? (
                  <form action={signInWithGoogle} className="mt-3 sm:mt-0">
                    <button type="submit" className="min-h-11 cursor-pointer rounded-xl bg-red-800 px-4 text-sm font-semibold text-white hover:bg-red-900">
                      Reconnecter Google
                    </button>
                  </form>
                ) : (
                  <button type="button" onClick={refreshInbox} className="mt-3 min-h-11 cursor-pointer rounded-xl border border-red-300 bg-white px-4 text-sm font-semibold text-red-900 sm:mt-0">
                    Réessayer
                  </button>
                )}
              </section>
            ) : null}

            <section aria-label="Messages Gmail" className="mt-4 overflow-hidden rounded-2xl border border-[#e4e4e7] bg-white">
              {isLoading && !data ? <LoadingInbox /> : null}
              {data && data.messages.length === 0 ? (
                <div className="flex min-h-80 flex-col items-center justify-center p-8 text-center">
                  <MailboxIcon name="inbox" className="size-8 text-[#71717a]" />
                  <h2 className="mt-4 font-semibold">Aucun message trouvé</h2>
                  <p className="mt-2 text-sm text-[#52525b]">Changez de dossier ou modifiez la recherche.</p>
                </div>
              ) : null}
              {data && data.messages.length > 0 ? (
                <>
                  <div className="grid min-h-[620px] xl:grid-cols-[minmax(300px,410px)_minmax(0,1fr)]">
                    <div className="max-h-[620px] overflow-y-auto border-b border-[#e4e4e7] xl:max-h-[820px] xl:border-b-0 xl:border-r">
                      <div className="sticky top-0 z-10 border-b border-[#e4e4e7] bg-white px-4 py-3">
                        <p className="text-sm font-semibold">Page {pageIndex + 1} · {data.messages.length} messages</p>
                        <p className="mt-0.5 text-xs text-[#52525b]">
                          Mis à jour à {new Date(data.syncedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      {data.messages.map((message) => (
                        <MessageRow
                          key={message.id}
                          message={message}
                          selected={message.id === selectedMessage?.id}
                          onSelect={() => {
                            setSelectedMessageId(message.id);
                            setDetailState({ status: "idle" });
                          }}
                        />
                      ))}
                    </div>
                    <div className="min-w-0">
                      <MessagePreview
                        message={selectedMessage}
                        detail={detailState}
                        accountEmail={user.email}
                        currentView={currentView}
                        labels={data.labels}
                        actionPending={actionPending}
                        onCompose={setComposerSession}
                        onAction={(action, labelId) => void performAction(action, labelId)}
                        onRefresh={refreshInbox}
                      />
                    </div>
                  </div>
                  <nav aria-label="Pagination Gmail" className="flex items-center justify-between gap-3 border-t border-[#e4e4e7] bg-[#fafafa] p-3 sm:px-5">
                    <button type="button" onClick={showPreviousPage} disabled={pageIndex === 0 || isLoading} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[#d4d4d8] bg-white px-4 text-sm font-semibold text-[#3f3f46] hover:bg-[#f4f4f5] disabled:cursor-not-allowed disabled:opacity-50">
                      <MailboxIcon name="chevron" className="size-4 rotate-90" /> Précédente
                    </button>
                    <span className="text-sm font-semibold text-[#52525b]">Page {pageIndex + 1}</span>
                    <button type="button" onClick={showNextPage} disabled={!data.hasMore || isLoading} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[#d4d4d8] bg-white px-4 text-sm font-semibold text-[#3f3f46] hover:bg-[#f4f4f5] disabled:cursor-not-allowed disabled:opacity-50">
                      Suivante <MailboxIcon name="chevron" className="size-4 -rotate-90" />
                    </button>
                  </nav>
                </>
              ) : null}
            </section>
          </div>
        </div>
      </main>

      {composerSession ? (
        <EmailComposer
          key={`${composerSession.mode}-${composerSession.sourceEmailId ?? "new"}`}
          deliveryMode="gmail"
          senderEmail={user.email}
          session={composerSession}
          writingStyle={aiPreferences.writingStyle}
          onClose={() => setComposerSession(null)}
          onSend={sendMessage}
        />
      ) : null}
    </div>
  );
}
