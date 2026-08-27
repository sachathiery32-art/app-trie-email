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
import { MailSettingsPanel } from "@/components/mail-settings-panel";
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
  GmailDraftResponse,
  GmailLabelCreateResponse,
  GmailLabelSummary,
  GmailMailboxView,
  GmailMessageDetail,
  GmailMessageResponse,
  GmailMessageSummary,
  GmailModifyAction,
  GmailModifyResponse,
  GmailSendResponse,
} from "@/types/gmail";
import type { MailSettingsData, MailSettingsResponse } from "@/types/settings";

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

const PERSONAL_FOLDER_PREFIX = "Dossiers/";
const DEFAULT_MAIL_SETTINGS: MailSettingsData = {
  databaseReady: false,
  preferences: {
    autoTriage: true,
    writingStyle: "",
    signature: "",
    undoSendSeconds: 10,
    notificationsEnabled: false,
  },
  templates: [],
  rules: [],
  vapidPublicKey: "",
};

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

function toLocalDateTimeInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
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
    <div aria-live="polite" aria-busy="true" className="p-3">
      <p className="text-sm font-semibold text-[#52525b]">
        Chargement sécurisé de Gmail…
      </p>
      <div className="mt-3 divide-y divide-[#e4e4e7]">
        {Array.from({ length: 10 }, (_, index) => index).map((item) => (
          <div
            key={item}
            className="h-12 animate-pulse bg-[#f1f1f3] motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  );
}

function MessageRow({
  message,
  active,
  checked,
  onSelect,
  onToggleChecked,
}: {
  message: GmailMessageSummary;
  active: boolean;
  checked: boolean;
  onSelect: () => void;
  onToggleChecked: () => void;
}) {
  return (
    <div
      className={`flex min-h-14 w-full items-stretch border-b border-[#e4e4e7] transition-colors duration-200 md:min-h-12 ${
        active
          ? "bg-[#dbeafe] shadow-[inset_3px_0_0_#2563eb]"
          : message.isUnread
            ? "bg-white hover:bg-[#f5f8fc]"
            : "bg-[#f8fafd] hover:bg-[#eef3f8]"
      }`}
    >
      <label className="flex min-h-11 w-11 shrink-0 cursor-pointer items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggleChecked}
          aria-label={`Sélectionner ${message.subject}`}
          className="size-4 accent-blue-700"
        />
      </label>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className="min-w-0 flex-1 cursor-pointer px-1 py-2 text-left focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#2563eb] md:py-0"
      >
        <div className="md:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {message.isUnread ? (
              <span className="size-2 shrink-0 rounded-full bg-[#2563eb]">
                <span className="sr-only">Message non lu</span>
              </span>
            ) : null}
            <p className={`truncate text-sm text-[#18181b] ${message.isUnread ? "font-bold" : "font-medium"}`}>
              {message.senderName}
            </p>
          </div>
          <time className="shrink-0 text-xs font-medium text-[#52525b]">
            {formatMessageDate(message.receivedAt)}
          </time>
        </div>
        <p className={`mt-1 truncate text-sm ${message.isUnread ? "font-semibold text-[#18181b]" : "text-[#3f3f46]"}`}>
          {message.subject} <span className="font-normal text-[#71717a]">— {message.snippet}</span>
        </p>
        </div>

        <div className="hidden h-12 grid-cols-[22px_minmax(110px,155px)_minmax(180px,1fr)_72px] items-center gap-2 md:grid">
        <span className="flex items-center justify-center">
          {message.isStarred ? (
            <MailboxIcon name="star" className="size-4 text-amber-600" />
          ) : message.isUnread ? (
            <span className="size-2 rounded-full bg-[#2563eb]">
              <span className="sr-only">Message non lu</span>
            </span>
          ) : (
            <span className="size-2 rounded-full bg-[#d4d4d8]" aria-hidden="true" />
          )}
        </span>
        <p className={`truncate text-sm text-[#18181b] ${message.isUnread ? "font-bold" : "font-medium"}`}>
          {message.senderName}
        </p>
        <p className={`truncate text-sm ${message.isUnread ? "font-semibold text-[#18181b]" : "text-[#3f3f46]"}`}>
          {message.subject}
          <span className="font-normal text-[#71717a]"> — {message.snippet}</span>
        </p>
        <time className={`text-right text-xs ${message.isUnread ? "font-bold text-[#18181b]" : "font-medium text-[#52525b]"}`}>
          {formatMessageDate(message.receivedAt)}
        </time>
        </div>
      </button>
    </div>
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
  onReminder,
  onEditDraft,
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
  onReminder: (kind: "snooze" | "reminder", messageIds: string[]) => void;
  onEditDraft: (message: GmailMessageDetail) => void;
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
        {currentView === "drafts" && complete ? (
          <ActionButton icon="draft" label="Modifier le brouillon" onClick={() => onEditDraft(complete)} />
        ) : null}
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
        <ActionButton
          icon="clock"
          label="Rappeler"
          disabled={actionPending}
          onClick={() => onReminder("reminder", [message.id])}
        />
        {message.labelIds.includes("INBOX") ? (
          <ActionButton
            icon="clock"
            label="Snooze"
            disabled={actionPending}
            onClick={() => onReminder("snooze", [message.id])}
          />
        ) : null}
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
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(() => new Set());
  const [detailState, setDetailState] = useState<DetailState>({ status: "idle" });
  const [pageIndex, setPageIndex] = useState(0);
  const [pageTokens, setPageTokens] = useState<Array<string | null>>([null]);
  const [composerSession, setComposerSession] = useState<ComposerSession | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [isTriageRunning, setIsTriageRunning] = useState(false);
  const [triageProgress, setTriageProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderParent, setFolderParent] = useState("");
  const [folderPending, setFolderPending] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);
  const [mailSettings, setMailSettings] = useState<MailSettingsData>(DEFAULT_MAIL_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    gmailMessageId: string | null;
    title: string;
    body: string;
    createdAt: string;
    read: boolean;
  }>>([]);
  const [syncMode, setSyncMode] = useState<"browser" | "activating" | "permanent" | "error">("browser");
  const [reminderDialog, setReminderDialog] = useState<{
    kind: "snooze" | "reminder";
    messageIds: string[];
  } | null>(null);
  const [reminderDate, setReminderDate] = useState("");
  const [minimumReminderDate] = useState(() => toLocalDateTimeInput(new Date(Date.now() + 60_000)));
  const [reminderPending, setReminderPending] = useState(false);
  const [pendingSend, setPendingSend] = useState<{
    scheduleId: string;
    scheduledFor: string;
    undoUntil?: string;
  } | null>(null);
  const [aiPreferences, setAiPreferences] = useState<AiUserPreferences>({
    autoTriage: true,
    writingStyle: "",
  });
  const detailCache = useRef(new Map<string, GmailMessageDetail>());
  const inboxRequestSequence = useRef(0);
  const triageInFlight = useRef(false);
  const autoTriageSeen = useRef(new Set<string>());
  const syncSetupStarted = useRef(false);

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
    const controller = new AbortController();
    void fetch("/api/settings", { cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then((payload: MailSettingsResponse) => {
        if (!payload.success) throw new Error(payload.error);
        setMailSettings(payload.data);
        setAiPreferences({
          autoTriage: payload.data.preferences.autoTriage,
          writingStyle: payload.data.preferences.writingStyle,
        });
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          console.error("Préférences serveur indisponibles.", error);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPreferencesHydrated(true);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!preferencesHydrated || !mailSettings.databaseReady || syncSetupStarted.current) return;
    syncSetupStarted.current = true;
    setSyncMode("activating");
    void fetch("/api/gmail/sync/setup", { method: "POST" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Synchronisation permanente non configurée.");
        setSyncMode("permanent");
      })
      .catch(() => setSyncMode("error"));
  }, [mailSettings.databaseReady, preferencesHydrated]);

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
  const personalFolderLabels = (data?.labels ?? [])
    .filter(
      (label) =>
        label.type === "user" && label.name.startsWith(PERSONAL_FOLDER_PREFIX),
    )
    .sort((left, right) => left.name.localeCompare(right.name, "fr"));
  const personalRootFolders = personalFolderLabels.filter(
    (label) => label.name.split("/").length === 2,
  );
  const selectedMessage = useMemo(
    () => data?.messages.find((message) => message.id === selectedMessageId) ?? null,
    [data, selectedMessageId],
  );
  const isLoading = state.status === "loading";

  const openComposer = useCallback(
    (session: ComposerSession) => {
      const signature = mailSettings.preferences.signature.trim();
      if (!signature || session.mode === "draft" || session.body.includes(signature)) {
        setComposerSession(session);
        return;
      }
      const signatureBlock = `\n\n-- \n${signature}`;
      setComposerSession({ ...session, body: `${signatureBlock}${session.body}` });
    },
    [mailSettings.preferences.signature],
  );

  function changeMailSettings(next: MailSettingsData) {
    setMailSettings(next);
    setAiPreferences({
      autoTriage: next.preferences.autoTriage,
      writingStyle: next.preferences.writingStyle,
    });
  }

  function changeAiPreferences(next: AiUserPreferences) {
    setAiPreferences(next);
    const preferences = {
      ...mailSettings.preferences,
      autoTriage: next.autoTriage,
      writingStyle: next.writingStyle,
    };
    setMailSettings((current) => ({ ...current, preferences }));
    void fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preferences),
    }).catch(() => {
      setNotice({ tone: "error", message: "Les préférences IA n’ont pas pu être enregistrées." });
    });
  }

  async function openNotificationCenter() {
    setShowNotifications(true);
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const payload = (await response.json()) as { success?: boolean; data?: typeof notifications };
      if (response.ok && payload.success) {
        setNotifications(payload.data ?? []);
        void fetch("/api/notifications", { method: "PUT" });
      }
    } catch {
      setNotice({ tone: "error", message: "Les notifications ne peuvent pas être chargées." });
    }
  }

  function selectView(view: GmailMailboxView) {
    if (view === currentView) return;
    setCurrentView(view);
    setPageIndex(0);
    setPageTokens([null]);
    setSelectedMessageId(null);
    setDetailState({ status: "idle" });
    setSelectedMessageIds(new Set());
    setNotice(null);
    detailCache.current.clear();
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPageIndex(0);
    setPageTokens([null]);
    setSelectedMessageId(null);
    setSelectedMessageIds(new Set());
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
      const ids = [...new Set(messageIds)].slice(0, 100);
      if (!ids.length) return [];

      triageInFlight.current = true;
      setIsTriageRunning(true);
      setTriageProgress({ completed: 0, total: ids.length });
      try {
        const items: GmailAiTriageItem[] = [];
        for (let index = 0; index < ids.length; index += 10) {
          const batch = ids.slice(index, index + 10);
          let completedBatch = false;
          for (let attempt = 0; attempt < 3 && !completedBatch; attempt += 1) {
            const response = await fetch("/api/gmail/ai/triage", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ messageIds: batch, applyLabels: true }),
            });
            const payload = (await response.json()) as GmailAiTriageResponse;
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
              throw new Error(payload.success ? "Classement incomplet." : payload.error);
            }
            items.push(...payload.data.items);
            completedBatch = true;
            setTriageProgress({
              completed: Math.min(index + batch.length, ids.length),
              total: ids.length,
            });
          }
          if (!completedBatch) {
            throw new Error(`Classement interrompu après ${items.length} message(s).`);
          }
        }

        detailCache.current.clear();
        setNotice({
          tone: "success",
          message: options?.automatic
            ? `${items.length} nouveau(x) message(s) classé(s) automatiquement.`
            : `${items.length} message(s) classé(s) et synchronisé(s) avec Gmail.`,
        });
        await loadInbox(pageTokens[pageIndex] ?? null, { silent: true });
        return items;
      } finally {
        triageInFlight.current = false;
        setIsTriageRunning(false);
        setTriageProgress(null);
      }
    },
    [loadInbox, pageIndex, pageTokens],
  );

  async function createPersonalFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = folderName.trim();
    if (!name || folderPending) return;
    setFolderPending(true);
    setFolderError(null);
    try {
      const response = await fetch("/api/gmail/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parent: folderParent }),
      });
      const payload = (await response.json()) as GmailLabelCreateResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.success ? "Création incomplète." : payload.error);
      }

      setFolderName("");
      setFolderParent("");
      setShowFolderForm(false);
      setNotice({ tone: "success", message: `Le dossier « ${name} » a été créé.` });
      await loadInbox(pageTokens[pageIndex] ?? null, { silent: true });

      const visibleIds = data?.messages.slice(0, 100).map((message) => message.id) ?? [];
      visibleIds.forEach((id) => autoTriageSeen.current.delete(id));
      if (visibleIds.length) {
        void runAiTriage(visibleIds, { automatic: true }).catch((error) => {
          setNotice({
            tone: "error",
            message:
              error instanceof Error
                ? `Dossier créé, mais le reclassement a échoué : ${error.message}`
                : "Le dossier est créé, mais le reclassement a échoué.",
          });
        });
      }
    } catch (error) {
      setFolderError(
        error instanceof Error ? error.message : "Le dossier n’a pas pu être créé.",
      );
    } finally {
      setFolderPending(false);
    }
  }

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
      .slice(0, 10)
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

  async function performBulkAction(
    action: "mark_read" | "mark_unread" | "star" | "archive" | "trash",
  ) {
    const messageIds = [...selectedMessageIds];
    if (!messageIds.length || actionPending) return;
    setActionPending(true);
    setNotice(null);
    try {
      const response = await fetch("/api/gmail/messages/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, messageIds }),
      });
      const payload = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error || "Action groupée incomplète.");
      setSelectedMessageIds(new Set());
      setNotice({ tone: "success", message: `${messageIds.length} message(s) modifié(s) dans Gmail.` });
      await loadInbox(pageTokens[pageIndex] ?? null);
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Action groupée impossible." });
    } finally {
      setActionPending(false);
    }
  }

  function openReminder(kind: "snooze" | "reminder", messageIds: string[]) {
    setReminderDialog({ kind, messageIds });
    setReminderDate(toLocalDateTimeInput(new Date(Date.now() + 24 * 60 * 60 * 1_000)));
  }

  async function submitReminder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reminderDialog || !reminderDate || reminderPending) return;
    setReminderPending(true);
    try {
      const response = await fetch("/api/gmail/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: reminderDialog.kind,
          messageIds: reminderDialog.messageIds,
          remindAt: new Date(reminderDate).toISOString(),
        }),
      });
      const payload = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error || "Rappel incomplet.");
      setNotice({
        tone: "success",
        message: reminderDialog.kind === "snooze"
          ? `${reminderDialog.messageIds.length} message(s) masqué(s) jusqu’au rappel.`
          : `${reminderDialog.messageIds.length} rappel(s) enregistré(s).`,
      });
      setSelectedMessageIds(new Set());
      setReminderDialog(null);
      await loadInbox(pageTokens[pageIndex] ?? null);
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Rappel impossible." });
    } finally {
      setReminderPending(false);
    }
  }

  const saveDraft = useCallback(
    async (message: ComposerMessage, attachments: File[], draftId?: string) => {
      if (!composerSession) throw new Error("La fenêtre de rédaction a expiré.");
      const formData = new FormData();
      formData.set("mode", composerSession.mode === "draft" ? "compose" : composerSession.mode);
      if (composerSession.sourceEmailId) formData.set("sourceMessageId", composerSession.sourceEmailId);
      if (draftId) formData.set("draftId", draftId);
      for (const [key, value] of Object.entries(message)) formData.set(key, value);
      for (const attachment of attachments) formData.append("attachments", attachment);
      const response = await fetch("/api/gmail/drafts", { method: "POST", body: formData });
      const payload = (await response.json().catch(() => null)) as GmailDraftResponse | null;
      if (!payload || !response.ok || !payload.success) {
        throw new Error(payload && !payload.success ? payload.error : "Le brouillon Gmail n’a pas pu être enregistré.");
      }
      return payload.data.draftId;
    },
    [composerSession],
  );

  async function editGmailDraft(message: GmailMessageDetail) {
    try {
      const response = await fetch(`/api/gmail/drafts?messageId=${encodeURIComponent(message.id)}`, { cache: "no-store" });
      const payload = (await response.json()) as GmailDraftResponse;
      if (!response.ok || !payload.success) throw new Error(payload.success ? "Brouillon incomplet." : payload.error);
      setComposerSession({
        mode: "draft",
        draftId: payload.data.draftId,
        to: message.recipients,
        cc: message.cc,
        bcc: "",
        subject: message.subject,
        body: message.bodyText,
      });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Brouillon indisponible." });
    }
  }

  const sendMessage = useCallback(
    async (
      message: ComposerMessage,
      attachments: File[],
      options?: { scheduledFor?: string; draftId?: string },
    ) => {
      if (!composerSession) throw new Error("La fenêtre de rédaction a expiré.");
      const formData = new FormData();
      formData.set(
        "mode",
        composerSession.mode === "draft" ? "compose" : composerSession.mode,
      );
      if (composerSession.sourceEmailId) {
        formData.set("sourceMessageId", composerSession.sourceEmailId);
      }
      if (options?.draftId) formData.set("draftId", options.draftId);
      if (options?.scheduledFor) formData.set("scheduledFor", options.scheduledFor);
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
      if (payload.data.status === "scheduled") {
        const scheduledData = payload.data;
        setPendingSend({
          scheduleId: scheduledData.scheduleId,
          scheduledFor: scheduledData.scheduledFor,
          undoUntil: scheduledData.undoUntil,
        });
        setNotice({
          tone: "success",
          message: scheduledData.undoUntil
            ? "Message prêt. Vous pouvez encore annuler l’envoi."
            : `Envoi programmé le ${new Date(scheduledData.scheduledFor).toLocaleString("fr-FR")}.`,
        });
        if (scheduledData.undoUntil) {
          const delay = Math.max(0, new Date(scheduledData.undoUntil).getTime() - Date.now() + 150);
          window.setTimeout(() => {
            void fetch(`/api/gmail/scheduled/${encodeURIComponent(scheduledData.scheduleId)}`, { method: "POST" })
              .then((response) => {
                if (response.ok) setNotice({ tone: "success", message: "Message envoyé par Gmail." });
                else setNotice({ tone: "error", message: "L’envoi est resté dans la file d’attente et sera réessayé par le serveur." });
              })
              .finally(() => {
                setPendingSend((current) => current?.scheduleId === scheduledData.scheduleId ? null : current);
                void loadInbox(pageTokens[pageIndex] ?? null, { silent: true });
              });
          }, delay);
        }
      } else {
        setNotice({ tone: "success", message: `Message remis à Gmail avec succès (identifiant ${payload.data.messageId}).` });
      }
      detailCache.current.clear();
      void loadInbox(pageTokens[pageIndex] ?? null, { silent: true });
    },
    [composerSession, loadInbox, pageIndex, pageTokens],
  );

  async function cancelPendingSend() {
    if (!pendingSend) return;
    const response = await fetch(`/api/gmail/scheduled/${encodeURIComponent(pendingSend.scheduleId)}`, { method: "DELETE" });
    const payload = (await response.json().catch(() => null)) as { success?: boolean; error?: string; data?: { gmailDraftId?: string } } | null;
    if (!response.ok || !payload?.success) {
      setNotice({ tone: "error", message: payload?.error || "L’envoi n’a pas pu être annulé." });
      return;
    }
    setPendingSend(null);
    setNotice({ tone: "info", message: "Envoi annulé. Le message reste dans les brouillons Gmail." });
    void loadInbox(pageTokens[pageIndex] ?? null, { silent: true });
  }

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

  const activePersonalFolder = data?.labels.find(
    (label) =>
      label.name.startsWith(PERSONAL_FOLDER_PREFIX) &&
      search === `label:"${label.name}"`,
  );
  const currentViewLabel = activePersonalFolder
    ? activePersonalFolder.name.split("/").at(-1) ?? "Dossier"
    : (VIEW_ITEMS.find((item) => item.value === currentView)?.label ?? "Gmail");

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
              {isSyncing
                ? "Synchronisation…"
                : syncMode === "permanent"
                  ? "Sync permanente"
                  : syncMode === "activating"
                    ? "Activation sync…"
                    : syncMode === "error"
                      ? "Sync à configurer"
                      : "Gmail synchronisé"}
            </span>
            <button
              type="button"
              onClick={() => void openNotificationCenter()}
              aria-label="Afficher les notifications"
              className="relative flex size-11 cursor-pointer items-center justify-center rounded-xl border border-[#d4d4d8] bg-white text-[#3f3f46] transition-colors hover:bg-[#f4f4f5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              <MailboxIcon name="bell" className="size-5" />
              {notifications.some((item) => !item.read) ? <span className="absolute right-2 top-2 size-2 rounded-full bg-red-600"><span className="sr-only">Nouvelles notifications</span></span> : null}
            </button>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              aria-label="Ouvrir les préférences"
              className="flex size-11 cursor-pointer items-center justify-center rounded-xl border border-[#d4d4d8] bg-white text-[#3f3f46] transition-colors hover:bg-[#f4f4f5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              <MailboxIcon name="settings" className="size-5" />
            </button>
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
                openComposer({
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

            <div className="mt-4 border-t border-[#e4e4e7] pt-4">
              <div className="flex items-center justify-between gap-2 px-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#71717a]">
                  Mes dossiers
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowFolderForm((visible) => !visible);
                    setFolderError(null);
                  }}
                  aria-expanded={showFolderForm}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg px-2 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                >
                  <MailboxIcon name={showFolderForm ? "close" : "compose"} className="size-4" />
                  {showFolderForm ? "Fermer" : "Créer"}
                </button>
              </div>
              {showFolderForm ? (
                <form onSubmit={createPersonalFolder} className="mt-2 rounded-xl border border-blue-200 bg-blue-50 p-3">
                  <label htmlFor="folder-parent" className="text-xs font-semibold text-blue-950">
                    Emplacement
                  </label>
                  <select
                    id="folder-parent"
                    value={folderParent}
                    onChange={(event) => setFolderParent(event.target.value)}
                    className="mt-1 min-h-11 w-full rounded-lg border border-blue-200 bg-white px-2 text-base text-blue-950 outline-none focus:border-blue-700 focus:ring-1 focus:ring-blue-700 sm:text-sm"
                  >
                    <option value="">Dossier principal</option>
                    {personalRootFolders.map((folder) => (
                      <option key={folder.id} value={folder.name}>
                        Sous-dossier de {folder.name.replace(PERSONAL_FOLDER_PREFIX, "")}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="folder-name" className="mt-3 block text-xs font-semibold text-blue-950">
                    Nom choisi par le client
                  </label>
                  <input
                    id="folder-name"
                    value={folderName}
                    onChange={(event) => setFolderName(event.target.value)}
                    maxLength={50}
                    required
                    placeholder="Ex. Client Dupont"
                    className="mt-1 min-h-11 w-full rounded-lg border border-blue-200 bg-white px-3 text-base text-blue-950 outline-none focus:border-blue-700 focus:ring-1 focus:ring-blue-700 sm:text-sm"
                  />
                  {folderError ? (
                    <p role="alert" className="mt-2 text-xs leading-5 text-red-800">
                      {folderError}
                    </p>
                  ) : null}
                  <button
                    type="submit"
                    disabled={!folderName.trim() || folderPending}
                    className="mt-3 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-700 px-3 text-sm font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900 disabled:cursor-wait disabled:opacity-60"
                  >
                    <MailboxIcon name="check" className="size-4" />
                    {folderPending ? "Création…" : "Créer ce dossier"}
                  </button>
                </form>
              ) : null}

              {personalRootFolders.length ? (
                <nav aria-label="Dossiers personnalisés" className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
                  {personalRootFolders.map((folder) => {
                    const query = `label:"${folder.name}"`;
                    const selected = currentView === "all" && search === query;
                    const children = personalFolderLabels.filter(
                      (label) =>
                        label.name.startsWith(`${folder.name}/`) &&
                        label.name.split("/").length === 3,
                    );
                    return (
                      <div key={folder.id} className="rounded-xl">
                        <button
                          type="button"
                          onClick={() => applyGmailQuery(query)}
                          aria-current={selected ? "page" : undefined}
                          className={`flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl px-3 text-left text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${
                            selected
                              ? "bg-blue-50 text-blue-800"
                              : "text-[#3f3f46] hover:bg-[#f4f4f5]"
                          }`}
                        >
                          <MailboxIcon name="archive" className="size-4 shrink-0 text-blue-700" />
                          <span className="truncate">
                            {folder.name.replace(PERSONAL_FOLDER_PREFIX, "")}
                          </span>
                          {typeof folder.messagesTotal === "number" ? (
                            <span className="ml-auto text-xs tabular-nums">{folder.messagesTotal}</span>
                          ) : null}
                        </button>
                        {children.length ? (
                          <div className="ml-5 border-l border-blue-100 pl-1">
                            {children.map((child) => {
                              const childQuery = `label:"${child.name}"`;
                              const childSelected = currentView === "all" && search === childQuery;
                              return (
                                <button
                                  key={child.id}
                                  type="button"
                                  onClick={() => applyGmailQuery(childQuery)}
                                  aria-current={childSelected ? "page" : undefined}
                                  className={`flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${
                                    childSelected
                                      ? "bg-blue-50 text-blue-800"
                                      : "text-[#52525b] hover:bg-[#f4f4f5]"
                                  }`}
                                >
                                  <MailboxIcon name="label" className="size-4 shrink-0 text-blue-600" />
                                  <span className="truncate">{child.name.split("/").at(-1)}</span>
                                  {typeof child.messagesTotal === "number" ? (
                                    <span className="ml-auto text-xs tabular-nums">{child.messagesTotal}</span>
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </nav>
              ) : (
                <p className="mx-3 mt-2 rounded-xl bg-[#f4f4f5] p-3 text-xs leading-5 text-[#52525b]">
                  Créez vos propres dossiers. Groq utilisera leurs noms pour classer les nouveaux emails.
                </p>
              )}
            </div>

            <div className="mt-4 hidden border-t border-[#e4e4e7] pt-4 text-xs leading-5 text-[#71717a] lg:block">
              <p className="font-semibold text-[#52525b]">Synchronisation automatique</p>
              <p className="mt-1">Toutes les 60 secondes tant que le site est ouvert, puis à chaque retour sur l’onglet.</p>
            </div>
          </aside>

          <div className="min-w-0">
            <section className="rounded-2xl border border-[#e4e4e7] bg-white p-3 sm:p-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-semibold tracking-[-0.03em]">{currentViewLabel}</h1>
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-800">
                      Tri auto
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#52525b]">
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
                        className="min-h-11 w-full rounded-xl border border-[#d4d4d8] bg-[#f1f5f9] pl-10 pr-3 text-base outline-none transition-colors focus:border-[#2563eb] focus:bg-white focus:ring-1 focus:ring-[#2563eb] sm:text-sm"
                      />
                    </div>
                    <button type="submit" className="min-h-11 cursor-pointer rounded-xl bg-[#18181b] px-4 text-sm font-semibold text-white hover:bg-[#3f3f46] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18181b]">
                      Chercher
                    </button>
                  </form>
                  <button
                    type="button"
                    onClick={refreshInbox}
                    disabled={isLoading || isSyncing}
                    className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#d4d4d8] bg-white px-4 text-sm font-semibold text-[#3f3f46] transition-colors hover:bg-[#f4f4f5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] disabled:cursor-wait disabled:opacity-50"
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

            <details className="group/assistant mt-3 rounded-2xl border border-blue-200 bg-white">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-2xl px-4 text-sm font-semibold text-blue-950 transition-colors hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 [&::-webkit-details-marker]:hidden">
                <span className="flex size-8 items-center justify-center rounded-lg bg-blue-100 text-blue-800">
                  <MailboxIcon name="sparkles" className="size-4" />
                </span>
                <span>Assistant IA et recherche intelligente</span>
                <span className="ml-auto text-xs font-medium text-blue-700 group-open/assistant:hidden">Ouvrir</span>
                <span className="ml-auto hidden text-xs font-medium text-blue-700 group-open/assistant:inline">Réduire</span>
                <MailboxIcon name="chevron" className="size-4 rotate-90 transition-transform duration-200 group-open/assistant:rotate-180 motion-reduce:transition-none" />
              </summary>
              <div className="border-t border-blue-100 p-3 pt-0">
                <GmailAiCommandCenter
                  messages={data?.messages ?? []}
                  isTriageRunning={isTriageRunning}
                  triageProgress={triageProgress}
                  onTriage={runAiTriage}
                  onApplyGmailQuery={applyGmailQuery}
                  preferences={aiPreferences}
                  onPreferencesChange={changeAiPreferences}
                />
              </div>
            </details>

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
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <span>{notice.message}</span>
                  {pendingSend ? (
                    <button type="button" onClick={() => void cancelPendingSend()} className="inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-blue-300 bg-white px-4 text-sm font-bold text-blue-900 transition-colors hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900">
                      {pendingSend.undoUntil ? "Annuler l’envoi" : "Annuler la programmation"}
                    </button>
                  ) : null}
                </div>
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

            <section aria-label="Messages Gmail" className="mt-3 overflow-hidden rounded-2xl border border-[#e4e4e7] bg-white shadow-sm">
              {data ? (
                <nav aria-label="Catégories de messages" className="flex min-h-16 items-stretch overflow-x-auto border-b border-[#e4e4e7] bg-white px-1">
                  <button
                    type="button"
                    onClick={() => selectView("inbox")}
                    aria-current={currentView === "inbox" && !search ? "page" : undefined}
                    className={`relative flex min-w-36 cursor-pointer items-center gap-2 px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-700 ${
                      currentView === "inbox" && !search
                        ? "bg-blue-50 text-blue-800 after:absolute after:inset-x-3 after:bottom-0 after:h-1 after:rounded-t-full after:bg-blue-700"
                        : "text-[#52525b] hover:bg-[#f4f4f5] hover:text-[#18181b]"
                    }`}
                  >
                    <MailboxIcon name="inbox" className="size-5 shrink-0" />
                    Principale
                  </button>
                  {personalRootFolders.map((folder) => {
                    const query = `label:"${folder.name}"`;
                    const selected = currentView === "all" && search === query;
                    return (
                      <button
                        key={folder.id}
                        type="button"
                        onClick={() => applyGmailQuery(query)}
                        aria-current={selected ? "page" : undefined}
                        className={`relative flex min-w-36 cursor-pointer items-center gap-2 px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-700 ${
                          selected
                            ? "bg-blue-50 text-blue-800 after:absolute after:inset-x-3 after:bottom-0 after:h-1 after:rounded-t-full after:bg-blue-700"
                            : "text-[#52525b] hover:bg-[#f4f4f5] hover:text-[#18181b]"
                        }`}
                      >
                        <MailboxIcon name="archive" className="size-5 shrink-0" />
                        <span className="truncate">{folder.name.replace(PERSONAL_FOLDER_PREFIX, "")}</span>
                        {typeof folder.messagesTotal === "number" ? (
                          <span className="ml-auto rounded-full bg-[#e4e4e7] px-1.5 py-0.5 text-[10px] tabular-nums text-[#3f3f46]">
                            {folder.messagesTotal}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </nav>
              ) : null}
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
                  <div className="grid min-h-[660px] xl:grid-cols-[minmax(440px,560px)_minmax(0,1fr)]">
                    <div className="max-h-[660px] overflow-y-auto border-b border-[#e4e4e7] xl:max-h-[820px] xl:border-b-0 xl:border-r">
                      <div className="sticky top-0 z-10 flex min-h-11 items-center justify-between gap-3 border-b border-[#e4e4e7] bg-white/95 px-3 backdrop-blur-sm">
                        <div className="flex min-w-0 items-center gap-2">
                          <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center" title="Tout sélectionner">
                            <input
                              type="checkbox"
                              checked={selectedMessageIds.size === data.messages.length}
                              ref={(element) => { if (element) element.indeterminate = selectedMessageIds.size > 0 && selectedMessageIds.size < data.messages.length; }}
                              onChange={(event) => setSelectedMessageIds(event.target.checked ? new Set(data.messages.map((message) => message.id)) : new Set())}
                              aria-label="Tout sélectionner sur cette page"
                              className="size-4 accent-blue-700"
                            />
                          </label>
                          {selectedMessageIds.size ? (
                            <div className="flex max-w-[calc(100vw-5rem)] items-center gap-1 overflow-x-auto" aria-label="Actions groupées">
                              <span className="mr-1 text-xs font-bold text-blue-800">{selectedMessageIds.size}</span>
                              <button type="button" onClick={() => void performBulkAction("archive")} disabled={actionPending} aria-label="Archiver la sélection" title="Archiver" className="flex size-11 cursor-pointer items-center justify-center rounded-lg text-[#52525b] hover:bg-[#f4f4f5] focus-visible:outline-2 focus-visible:outline-blue-700 disabled:opacity-50"><MailboxIcon name="archive" className="size-4" /></button>
                              <button type="button" onClick={() => void performBulkAction("mark_read")} disabled={actionPending} aria-label="Marquer la sélection comme lue" title="Marquer lu" className="flex size-11 cursor-pointer items-center justify-center rounded-lg text-[#52525b] hover:bg-[#f4f4f5] focus-visible:outline-2 focus-visible:outline-blue-700 disabled:opacity-50"><MailboxIcon name="check" className="size-4" /></button>
                              <button type="button" onClick={() => void performBulkAction("star")} disabled={actionPending} aria-label="Ajouter la sélection aux favoris" title="Favoris" className="flex size-11 cursor-pointer items-center justify-center rounded-lg text-[#52525b] hover:bg-[#f4f4f5] focus-visible:outline-2 focus-visible:outline-blue-700 disabled:opacity-50"><MailboxIcon name="star" className="size-4" /></button>
                              <button type="button" onClick={() => openReminder("snooze", [...selectedMessageIds])} disabled={actionPending} aria-label="Snooze la sélection" title="Snooze" className="flex size-11 cursor-pointer items-center justify-center rounded-lg text-[#52525b] hover:bg-[#f4f4f5] focus-visible:outline-2 focus-visible:outline-blue-700 disabled:opacity-50"><MailboxIcon name="clock" className="size-4" /></button>
                              <button type="button" onClick={() => void performBulkAction("trash")} disabled={actionPending} aria-label="Mettre la sélection à la corbeille" title="Corbeille" className="flex size-11 cursor-pointer items-center justify-center rounded-lg text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-800 disabled:opacity-50"><MailboxIcon name="trash" className="size-4" /></button>
                            </div>
                          ) : (
                            <p className="truncate text-xs font-semibold text-[#3f3f46]">{data.messages.length} messages · page {pageIndex + 1}</p>
                          )}
                        </div>
                        <p className="hidden text-xs text-[#71717a] sm:block">{new Date(data.syncedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                      {data.messages.map((message) => (
                        <MessageRow
                          key={message.id}
                          message={message}
                          active={message.id === selectedMessage?.id}
                          checked={selectedMessageIds.has(message.id)}
                          onToggleChecked={() => {
                            setSelectedMessageIds((current) => {
                              const next = new Set(current);
                              if (next.has(message.id)) next.delete(message.id);
                              else next.add(message.id);
                              return next;
                            });
                          }}
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
                        onCompose={openComposer}
                        onAction={(action, labelId) => void performAction(action, labelId)}
                        onReminder={openReminder}
                        onEditDraft={(message) => void editGmailDraft(message)}
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
          onSaveDraft={saveDraft}
          onSend={sendMessage}
          templates={mailSettings.templates}
        />
      ) : null}

      {showSettings ? (
        <MailSettingsPanel
          open
          settings={mailSettings}
          labels={data?.labels ?? []}
          onClose={() => setShowSettings(false)}
          onChange={changeMailSettings}
        />
      ) : null}

      {showNotifications ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6">
          <section role="dialog" aria-modal="true" aria-labelledby="notifications-title" className="flex max-h-[80dvh] w-full flex-col bg-white sm:max-w-lg sm:rounded-2xl sm:border sm:border-[#d4d4d8]">
            <header className="flex min-h-16 items-center justify-between border-b border-[#e4e4e7] px-4">
              <div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-blue-700">Suivi important</p><h2 id="notifications-title" className="font-semibold">Notifications</h2></div>
              <button type="button" onClick={() => setShowNotifications(false)} aria-label="Fermer les notifications" className="flex size-11 cursor-pointer items-center justify-center rounded-xl text-[#52525b] hover:bg-[#f4f4f5] focus-visible:outline-2 focus-visible:outline-blue-700"><MailboxIcon name="close" /></button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {notifications.length ? (
                <ul className="grid gap-2">{notifications.map((item) => (
                  <li key={item.id}>
                    <article className="min-h-16 w-full rounded-xl border border-[#e4e4e7] bg-white px-3 py-3 text-left">
                      <span className="block text-sm font-semibold text-[#18181b]">{item.title}</span>
                      <span className="mt-1 block text-sm text-[#52525b]">{item.body}</span>
                      <time className="mt-1 block text-xs text-[#71717a]">{new Date(item.createdAt).toLocaleString("fr-FR")}</time>
                    </article>
                  </li>
                ))}</ul>
              ) : <div className="flex min-h-48 flex-col items-center justify-center text-center"><MailboxIcon name="bell" className="size-7 text-[#71717a]" /><p className="mt-3 text-sm font-semibold">Aucune notification importante</p></div>}
            </div>
          </section>
        </div>
      ) : null}

      {reminderDialog ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6">
          <form onSubmit={submitReminder} role="dialog" aria-modal="true" aria-labelledby="reminder-title" className="w-full bg-white p-5 sm:max-w-md sm:rounded-2xl sm:border sm:border-[#d4d4d8]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-blue-700">{reminderDialog.messageIds.length} message(s)</p>
                <h2 id="reminder-title" className="mt-1 text-lg font-semibold text-[#18181b]">{reminderDialog.kind === "snooze" ? "Snooze jusqu’à…" : "Créer un rappel"}</h2>
              </div>
              <button type="button" onClick={() => setReminderDialog(null)} aria-label="Fermer" className="flex size-11 cursor-pointer items-center justify-center rounded-xl text-[#52525b] hover:bg-[#f4f4f5] focus-visible:outline-2 focus-visible:outline-blue-700"><MailboxIcon name="close" /></button>
            </div>
            <label htmlFor="reminder-date" className="mt-5 block text-sm font-semibold text-[#3f3f46]">Date et heure</label>
            <input id="reminder-date" type="datetime-local" required min={minimumReminderDate} value={reminderDate} onChange={(event) => setReminderDate(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-[#d4d4d8] px-3 text-base outline-none focus:border-blue-700 focus:ring-1 focus:ring-blue-700" />
            <p className="mt-3 text-sm leading-6 text-[#52525b]">{reminderDialog.kind === "snooze" ? "Le message quitte la réception puis revient automatiquement à cette date." : "Le message reste à sa place et une notification sera créée à cette date."}</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setReminderDialog(null)} className="min-h-11 cursor-pointer rounded-xl border border-[#d4d4d8] bg-white px-4 text-sm font-semibold hover:bg-[#f4f4f5] focus-visible:outline-2 focus-visible:outline-blue-700">Annuler</button>
              <button type="submit" disabled={reminderPending || !reminderDate} className="min-h-11 cursor-pointer rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900 disabled:cursor-wait disabled:opacity-60">{reminderPending ? "Enregistrement…" : "Confirmer"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
