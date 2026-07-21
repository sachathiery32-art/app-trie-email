"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { EmailComposer } from "@/components/email-composer";
import {
  MailboxIcon,
  type MailboxIconName,
} from "@/components/mailbox-icon";
import { useDemoMailbox } from "@/hooks/use-demo-mailbox";
import { DEMO_EMAIL_IDS, DEMO_OWNER } from "@/lib/demo-emails";
import { EMAIL_CATEGORY_LABELS } from "@/lib/email-categories";
import {
  EMAIL_CATEGORIES,
  type ClassifyEmailResponse,
  type ComposerMessage,
  type ComposerSession,
  type EmailCategory,
  type MailboxView,
  type OrganizerEmail,
} from "@/types/email";

const CATEGORY_VISUALS = {
  professional: {
    dot: "bg-blue-600",
    badge: "border-blue-200 bg-blue-50 text-blue-800",
  },
  personal: {
    dot: "bg-violet-600",
    badge: "border-violet-200 bg-violet-50 text-violet-800",
  },
  newsletter: {
    dot: "bg-cyan-600",
    badge: "border-cyan-200 bg-cyan-50 text-cyan-800",
  },
  promotion: {
    dot: "bg-amber-500",
    badge: "border-amber-200 bg-amber-50 text-amber-900",
  },
  notification: {
    dot: "bg-slate-500",
    badge: "border-slate-200 bg-slate-100 text-slate-800",
  },
  spam: {
    dot: "bg-red-600",
    badge: "border-red-200 bg-red-50 text-red-800",
  },
  other: {
    dot: "bg-neutral-400",
    badge: "border-neutral-200 bg-neutral-100 text-neutral-700",
  },
} satisfies Record<EmailCategory, { dot: string; badge: string }>;

const MAILBOX_NAVIGATION: Array<{
  view: MailboxView;
  label: string;
  icon: MailboxIconName;
}> = [
  { view: "inbox", label: "Boîte de réception", icon: "inbox" },
  { view: "starred", label: "Favoris", icon: "star" },
  { view: "sent", label: "Envoyés", icon: "send" },
  { view: "drafts", label: "Brouillons", icon: "draft" },
  { view: "archive", label: "Archives", icon: "archive" },
  { view: "trash", label: "Corbeille", icon: "trash" },
];

const VIEW_LABELS = Object.fromEntries(
  MAILBOX_NAVIGATION.map((item) => [item.view, item.label]),
) as Record<MailboxView, string>;

type CategoryFilter = "all" | EmailCategory;
type SortMode = "recent" | "unread";

type AnalysisState =
  | { status: "idle" }
  | { status: "loading"; emailId: string }
  | {
      status: "success";
      emailId: string;
      data: Extract<ClassifyEmailResponse, { success: true }>["data"];
    }
  | { status: "error"; emailId: string; message: string };

type Toast = {
  id: number;
  tone: "success" | "info" | "error";
  message: string;
};

function CategoryBadge({ category }: { category: EmailCategory }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${CATEGORY_VISUALS[category].badge}`}
    >
      {EMAIL_CATEGORY_LABELS[category]}
    </span>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: MailboxIconName;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border bg-white px-3 text-sm font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171717] ${
        danger
          ? "border-red-200 text-red-800 hover:bg-red-50"
          : "border-[#d9dce2] text-[#394150] hover:border-[#aeb4bf] hover:bg-[#f7f7f8]"
      }`}
    >
      <MailboxIcon name={icon} className="size-4" />
      {label}
    </button>
  );
}

function parseAddressList(value: string) {
  return value
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
}

function subjectWithPrefix(subject: string, prefix: "Re:" | "Tr:") {
  return subject.toLocaleLowerCase("fr-FR").startsWith(prefix.toLowerCase())
    ? subject
    : `${prefix} ${subject}`;
}

function messagePreview(body: string) {
  const normalizedBody = body.replace(/\s+/g, " ").trim();
  return normalizedBody.length > 120
    ? `${normalizedBody.slice(0, 117)}…`
    : normalizedBody;
}

function formatCurrentTime() {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

export function EmailSortingDashboard() {
  const { emails, setEmails, resetMailbox, isHydrated } = useDemoMailbox();
  const [activeView, setActiveView] = useState<MailboxView>("inbox");
  const [selectedEmailId, setSelectedEmailId] = useState("demo-1");
  const [activeCategory, setActiveCategory] =
    useState<CategoryFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [analysisState, setAnalysisState] = useState<AnalysisState>({
    status: "idle",
  });
  const [composerSession, setComposerSession] =
    useState<ComposerSession | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const notify = useCallback(
    (message: string, tone: Toast["tone"] = "success") => {
      setToast({ id: Date.now(), message, tone });
    },
    [],
  );

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutId = window.setTimeout(() => setToast(null), 4_000);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const folderCounts = useMemo(
    () => ({
      inbox: emails.filter((email) => email.folder === "inbox").length,
      starred: emails.filter(
        (email) => email.isStarred && email.folder !== "trash",
      ).length,
      sent: emails.filter((email) => email.folder === "sent").length,
      drafts: emails.filter((email) => email.folder === "drafts").length,
      archive: emails.filter((email) => email.folder === "archive").length,
      trash: emails.filter((email) => email.folder === "trash").length,
    }),
    [emails],
  );

  const categoryCounts = useMemo(
    () =>
      Object.fromEntries(
        EMAIL_CATEGORIES.map((category) => [
          category,
          emails.filter(
            (email) =>
              email.folder === "inbox" && email.category === category,
          ).length,
        ]),
      ) as Record<EmailCategory, number>,
    [emails],
  );

  const visibleEmails = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase("fr-FR");

    const filteredEmails = emails.filter((email) => {
      const matchesView =
        activeView === "starred"
          ? email.isStarred && email.folder !== "trash"
          : email.folder === activeView;
      const matchesCategory =
        activeView !== "inbox" ||
        activeCategory === "all" ||
        email.category === activeCategory;
      const matchesSearch =
        normalizedQuery.length === 0 ||
        [
          email.senderName,
          email.sender,
          email.recipients.join(" "),
          email.subject,
          email.preview,
        ].some((value) =>
          value.toLocaleLowerCase("fr-FR").includes(normalizedQuery),
        );

      return matchesView && matchesCategory && matchesSearch;
    });

    return [...filteredEmails].sort((firstEmail, secondEmail) => {
      if (sortMode === "unread" && firstEmail.isRead !== secondEmail.isRead) {
        return Number(firstEmail.isRead) - Number(secondEmail.isRead);
      }

      return secondEmail.timestamp - firstEmail.timestamp;
    });
  }, [activeCategory, activeView, emails, searchQuery, sortMode]);

  const selectedEmail =
    visibleEmails.find((email) => email.id === selectedEmailId) ??
    visibleEmails[0] ??
    null;

  const unreadCount = emails.filter(
    (email) => email.folder === "inbox" && !email.isRead,
  ).length;
  const starredCount = folderCounts.starred;

  function switchView(view: MailboxView) {
    setActiveView(view);
    setActiveCategory("all");
    setAnalysisState({ status: "idle" });
  }

  function selectEmail(emailId: string) {
    setSelectedEmailId(emailId);
    setAnalysisState({ status: "idle" });
    setEmails((currentEmails) =>
      currentEmails.map((email) =>
        email.id === emailId && !email.isRead
          ? { ...email, isRead: true }
          : email,
      ),
    );
  }

  function updateEmail(emailId: string, changes: Partial<OrganizerEmail>) {
    setEmails((currentEmails) =>
      currentEmails.map((email) =>
        email.id === emailId ? { ...email, ...changes } : email,
      ),
    );
  }

  function moveSelectedEmail(
    folder: OrganizerEmail["folder"],
    confirmation: string,
  ) {
    if (!selectedEmail) {
      return;
    }

    updateEmail(selectedEmail.id, { folder });
    setSelectedEmailId("");
    setAnalysisState({ status: "idle" });
    notify(confirmation);
  }

  function deleteSelectedEmailPermanently() {
    if (!selectedEmail) {
      return;
    }

    setEmails((currentEmails) =>
      currentEmails.filter((email) => email.id !== selectedEmail.id),
    );
    setSelectedEmailId("");
    notify("Email supprimé de la démonstration.", "info");
  }

  function openNewMessage() {
    setComposerSession({
      mode: "compose",
      to: "",
      cc: "",
      bcc: "",
      subject: "",
      body: "",
    });
  }

  function openReply(email: OrganizerEmail) {
    setComposerSession({
      mode: "reply",
      sourceEmailId: email.id,
      to: email.sender,
      cc: "",
      bcc: "",
      subject: subjectWithPrefix(email.subject, "Re:"),
      body: "",
    });
  }

  function openForward(email: OrganizerEmail) {
    setComposerSession({
      mode: "forward",
      sourceEmailId: email.id,
      to: "",
      cc: "",
      bcc: "",
      subject: subjectWithPrefix(email.subject, "Tr:"),
      body: [
        "",
        "",
        "---------- Message transféré ----------",
        `De : ${email.senderName} <${email.sender}>`,
        `Objet : ${email.subject}`,
        "",
        email.body,
      ].join("\n"),
    });
  }

  function openDraft(email: OrganizerEmail) {
    setComposerSession({
      mode: "draft",
      draftId: email.id,
      sourceEmailId: email.sourceEmailId,
      to: email.recipients.join(", "),
      cc: email.cc.join(", "),
      bcc: email.bcc.join(", "),
      subject: email.subject,
      body: email.body,
    });
  }

  function createOutgoingEmail(
    message: ComposerMessage,
    folder: "sent" | "drafts",
  ): OrganizerEmail {
    const now = Date.now();

    return {
      id:
        composerSession?.draftId ??
        `${folder}-${globalThis.crypto.randomUUID()}`,
      senderName: DEMO_OWNER.name,
      sender: DEMO_OWNER.email,
      recipients: parseAddressList(message.to),
      cc: parseAddressList(message.cc),
      bcc: parseAddressList(message.bcc),
      subject: message.subject.trim() || "Sans objet",
      body: message.body.trim(),
      preview: messagePreview(message.body),
      receivedAt: folder === "drafts" ? "Brouillon" : formatCurrentTime(),
      timestamp: now,
      category: "other",
      folder,
      direction: "outgoing",
      isRead: true,
      isStarred: false,
      sourceEmailId: composerSession?.sourceEmailId,
    };
  }

  function saveDraft(message: ComposerMessage) {
    const draft = createOutgoingEmail(message, "drafts");

    setEmails((currentEmails) => [
      draft,
      ...currentEmails.filter((email) => email.id !== draft.id),
    ]);
    setComposerSession(null);
    setActiveView("drafts");
    setSelectedEmailId(draft.id);
    notify("Brouillon enregistré dans ce navigateur.");
  }

  function sendMessage(message: ComposerMessage) {
    const sentEmail = createOutgoingEmail(message, "sent");

    setEmails((currentEmails) => [
      sentEmail,
      ...currentEmails.filter(
        (email) => email.id !== composerSession?.draftId,
      ),
    ]);
    setComposerSession(null);
    setActiveView("sent");
    setSelectedEmailId(sentEmail.id);
    notify("Envoi simulé : aucun message réel n’a quitté l’application.");
  }

  function resetDemo() {
    resetMailbox();
    setActiveView("inbox");
    setSelectedEmailId("demo-1");
    setActiveCategory("all");
    setSearchQuery("");
    setSortMode("recent");
    setAnalysisState({ status: "idle" });
    setComposerSession(null);
    notify("La démonstration a été réinitialisée.", "info");
  }

  async function analyzeSelectedEmail() {
    if (!selectedEmail || !DEMO_EMAIL_IDS.has(selectedEmail.id)) {
      notify("Seuls les emails fictifs d’origine peuvent être analysés.", "error");
      return;
    }

    const emailToAnalyze = selectedEmail;
    setAnalysisState({ status: "loading", emailId: emailToAnalyze.id });

    try {
      const response = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId: emailToAnalyze.id }),
      });
      const payload = (await response.json()) as ClassifyEmailResponse;

      if (!response.ok || !payload.success) {
        throw new Error(
          payload.success
            ? "La route API a retourné une réponse inattendue."
            : payload.error,
        );
      }

      updateEmail(emailToAnalyze.id, { category: payload.data.category });
      setAnalysisState({
        status: "success",
        emailId: emailToAnalyze.id,
        data: payload.data,
      });
    } catch (error) {
      setAnalysisState({
        status: "error",
        emailId: emailToAnalyze.id,
        message:
          error instanceof Error
            ? error.message
            : "Une erreur inconnue est survenue.",
      });
    }
  }

  const selectedAnalysis =
    selectedEmail &&
    analysisState.status !== "idle" &&
    analysisState.emailId === selectedEmail.id
      ? analysisState
      : ({ status: "idle" } as const);

  return (
    <div className="min-h-screen bg-[#f5f6f8] text-[#172033]">
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-50 -translate-y-24 rounded-lg bg-[#171717] px-4 py-3 text-sm font-semibold text-white transition-transform focus:translate-y-0"
      >
        Aller au contenu principal
      </a>

      <header className="border-b border-[#e3e6eb] bg-white">
        <div className="mx-auto flex min-h-18 max-w-[1700px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#171717] text-white">
              <MailboxIcon name="mail" className="size-5" />
            </div>
            <div>
              <p className="font-semibold tracking-[-0.02em] text-[#171717]">
                Email Organizer AI
              </p>
              <p className="text-xs text-[#667085]">Pilote de messagerie</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 md:inline-flex">
              <span className="size-2 rounded-full bg-amber-500" />
              Actions simulées
            </span>
            <span className="hidden text-xs text-[#667085] lg:inline">
              {isHydrated ? "Sauvegarde locale active" : "Chargement local…"}
            </span>
            <button
              type="button"
              onClick={resetDemo}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-[#d9dce2] bg-white px-3 text-sm font-semibold text-[#4d5768] transition-colors duration-200 hover:border-[#aeb4bf] hover:bg-[#f7f7f8] hover:text-[#171717] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171717]"
            >
              Réinitialiser
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1700px] lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="hidden border-r border-[#e3e6eb] bg-white px-4 py-6 lg:flex lg:min-h-[calc(100vh-73px)] lg:flex-col">
          <button
            type="button"
            onClick={openNewMessage}
            className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#2563eb] px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[#1d4ed8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171717]"
          >
            <MailboxIcon name="compose" />
            Nouveau message
          </button>

          <nav aria-label="Dossiers de messagerie" className="mt-6">
            <p className="px-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8494]">
              Messagerie
            </p>
            <div className="mt-3 space-y-1">
              {MAILBOX_NAVIGATION.map((item) => (
                <button
                  key={item.view}
                  type="button"
                  onClick={() => switchView(item.view)}
                  aria-current={activeView === item.view ? "page" : undefined}
                  className={`flex min-h-11 w-full cursor-pointer items-center justify-between rounded-xl px-3 text-left text-sm transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171717] ${
                    activeView === item.view
                      ? "bg-[#171717] font-semibold text-white"
                      : "text-[#4d5768] hover:bg-[#f2f3f5] hover:text-[#171717]"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <MailboxIcon name={item.icon} className="size-4" />
                    {item.label}
                  </span>
                  <span
                    className={
                      activeView === item.view
                        ? "text-white/70"
                        : "text-[#8a93a3]"
                    }
                  >
                    {folderCounts[item.view]}
                  </span>
                </button>
              ))}
            </div>

            <p className="mt-8 px-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8494]">
              Catégories
            </p>
            <div className="mt-3 space-y-1">
              {EMAIL_CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => {
                    switchView("inbox");
                    setActiveCategory(category);
                  }}
                  aria-current={
                    activeView === "inbox" && activeCategory === category
                      ? "page"
                      : undefined
                  }
                  className={`flex min-h-11 w-full cursor-pointer items-center justify-between rounded-xl px-3 text-left text-sm transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171717] ${
                    activeView === "inbox" && activeCategory === category
                      ? "bg-[#f1f2f4] font-semibold text-[#171717]"
                      : "text-[#4d5768] hover:bg-[#f7f7f8] hover:text-[#171717]"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span
                      className={`size-2.5 rounded-full ${CATEGORY_VISUALS[category].dot}`}
                    />
                    {EMAIL_CATEGORY_LABELS[category]}
                  </span>
                  <span className="text-[#8a93a3]">
                    {categoryCounts[category]}
                  </span>
                </button>
              ))}
            </div>
          </nav>

          <div className="mt-auto rounded-2xl border border-[#e3e6eb] bg-[#fafafa] p-4">
            <div className="flex size-9 items-center justify-center rounded-lg bg-[#f5e8b9] text-[#6b5200]">
              <MailboxIcon name="sparkles" className="size-4" />
            </div>
            <p className="mt-4 text-sm font-semibold text-[#252b37]">
              Démonstration personnelle
            </p>
            <p className="mt-1 text-xs leading-5 text-[#667085]">
              Les messages, envois et changements restent dans ce navigateur.
              Aucun compte réel n’est connecté.
            </p>
          </div>
        </aside>

        <main id="main-content" className="min-w-0 p-4 sm:p-6 xl:p-8">
          <section aria-labelledby="dashboard-title">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[#2563eb]">
                  Espace personnel fictif
                </p>
                <h1
                  id="dashboard-title"
                  className="mt-1 text-3xl font-semibold tracking-[-0.035em] text-[#171717] sm:text-4xl"
                >
                  Pilotez votre messagerie.
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[#667085] sm:text-base">
                  Rédigez, répondez, transférez et organisez vos messages. Chaque
                  action est simulée et peut être réinitialisée.
                </p>
              </div>
              <button
                type="button"
                onClick={openNewMessage}
                className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#2563eb] px-5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[#1d4ed8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171717] lg:hidden"
              >
                <MailboxIcon name="compose" />
                Nouveau message
              </button>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[
                {
                  label: "Réception",
                  value: folderCounts.inbox,
                  detail: "Messages disponibles",
                },
                { label: "Non lus", value: unreadCount, detail: "À consulter" },
                {
                  label: "Favoris",
                  value: starredCount,
                  detail: "Messages prioritaires",
                },
                {
                  label: "Brouillons",
                  value: folderCounts.drafts,
                  detail: "À terminer",
                },
              ].map((stat) => (
                <article
                  key={stat.label}
                  className="rounded-2xl border border-[#e3e6eb] bg-white p-4 sm:p-5"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8494]">
                    {stat.label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-[#171717] sm:text-3xl">
                    {stat.value}
                  </p>
                  <p className="mt-1 text-xs text-[#667085]">{stat.detail}</p>
                </article>
              ))}
            </div>
          </section>

          <section
            aria-label="Interface de pilotage des emails"
            className="mt-6 overflow-hidden rounded-2xl border border-[#e3e6eb] bg-white"
          >
            <div className="flex flex-col gap-3 border-b border-[#e3e6eb] p-3 sm:p-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="relative min-w-0 flex-1 xl:max-w-md">
                <label htmlFor="email-search" className="sr-only">
                  Rechercher dans les emails
                </label>
                <MailboxIcon
                  name="search"
                  className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-[#7b8494]"
                />
                <input
                  id="email-search"
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Rechercher un expéditeur ou un objet…"
                  className="min-h-11 w-full rounded-xl border border-[#d9dce2] bg-white pl-11 pr-4 text-base text-[#171717] outline-none transition-colors placeholder:text-[#8a93a3] focus:border-[#171717] focus:ring-1 focus:ring-[#171717] sm:text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:flex">
                <div className="relative lg:hidden">
                  <label htmlFor="mobile-mailbox-view" className="sr-only">
                    Choisir un dossier
                  </label>
                  <select
                    id="mobile-mailbox-view"
                    value={activeView}
                    onChange={(event) =>
                      switchView(event.target.value as MailboxView)
                    }
                    className="min-h-11 w-full cursor-pointer appearance-none rounded-xl border border-[#d9dce2] bg-white px-3 pr-9 text-sm font-medium text-[#394150] outline-none focus:border-[#171717] focus:ring-1 focus:ring-[#171717]"
                  >
                    {MAILBOX_NAVIGATION.map((item) => (
                      <option key={item.view} value={item.view}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <MailboxIcon
                    name="chevron"
                    className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 rotate-90 text-[#7b8494]"
                  />
                </div>

                <div className="relative">
                  <label htmlFor="mobile-category-filter" className="sr-only">
                    Filtrer par catégorie
                  </label>
                  <select
                    id="mobile-category-filter"
                    value={activeCategory}
                    disabled={activeView !== "inbox"}
                    onChange={(event) =>
                      setActiveCategory(event.target.value as CategoryFilter)
                    }
                    className="min-h-11 w-full cursor-pointer appearance-none rounded-xl border border-[#d9dce2] bg-white px-3 pr-9 text-sm font-medium text-[#394150] outline-none focus:border-[#171717] focus:ring-1 focus:ring-[#171717] disabled:cursor-not-allowed disabled:bg-[#f1f2f4] disabled:text-[#98a0ad] lg:hidden"
                  >
                    <option value="all">Toutes les catégories</option>
                    {EMAIL_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {EMAIL_CATEGORY_LABELS[category]}
                      </option>
                    ))}
                  </select>
                  <MailboxIcon
                    name="chevron"
                    className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 rotate-90 text-[#7b8494] lg:hidden"
                  />
                </div>

                <div className="relative col-span-2 sm:col-span-1">
                  <label htmlFor="email-sort" className="sr-only">
                    Trier les emails
                  </label>
                  <select
                    id="email-sort"
                    value={sortMode}
                    onChange={(event) =>
                      setSortMode(event.target.value as SortMode)
                    }
                    className="min-h-11 w-full cursor-pointer appearance-none rounded-xl border border-[#d9dce2] bg-white px-3 pr-9 text-sm font-medium text-[#394150] outline-none focus:border-[#171717] focus:ring-1 focus:ring-[#171717]"
                  >
                    <option value="recent">Plus récents</option>
                    <option value="unread">Non lus d’abord</option>
                  </select>
                  <MailboxIcon
                    name="chevron"
                    className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 rotate-90 text-[#7b8494]"
                  />
                </div>
              </div>
            </div>

            <div className="grid min-h-[660px] xl:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]">
              <div className="border-b border-[#e3e6eb] xl:border-b-0 xl:border-r">
                <div className="flex items-center justify-between border-b border-[#e3e6eb] px-4 py-3">
                  <p className="text-sm font-semibold text-[#394150]">
                    {activeView === "inbox" && activeCategory !== "all"
                      ? EMAIL_CATEGORY_LABELS[activeCategory]
                      : VIEW_LABELS[activeView]}
                  </p>
                  <span className="text-xs text-[#7b8494]">
                    {visibleEmails.length} résultat
                    {visibleEmails.length > 1 ? "s" : ""}
                  </span>
                </div>

                {visibleEmails.length > 0 ? (
                  <ul className="max-h-[660px] divide-y divide-[#eceef1] overflow-y-auto">
                    {visibleEmails.map((email) => {
                      const isSelected = email.id === selectedEmail?.id;
                      const displaySender =
                        email.direction === "outgoing"
                          ? `À : ${email.recipients.join(", ") || "destinataire à définir"}`
                          : email.senderName;

                      return (
                        <li key={email.id}>
                          <button
                            type="button"
                            onClick={() => selectEmail(email.id)}
                            aria-pressed={isSelected}
                            className={`w-full cursor-pointer px-4 py-4 text-left transition-colors duration-200 focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#171717] sm:px-5 ${
                              isSelected
                                ? "bg-[#eef4ff]"
                                : "bg-white hover:bg-[#f7f8f9]"
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <span
                                className={`mt-1.5 size-2 shrink-0 rounded-full ${
                                  email.isRead ? "bg-transparent" : "bg-blue-600"
                                }`}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-3">
                                  <p
                                    className={`truncate text-sm text-[#252b37] ${
                                      email.isRead ? "font-medium" : "font-bold"
                                    }`}
                                  >
                                    {email.folder === "drafts" && (
                                      <span className="text-red-700">Brouillon · </span>
                                    )}
                                    {displaySender}
                                  </p>
                                  <div className="flex shrink-0 items-center gap-2">
                                    {email.isStarred && (
                                      <span
                                        className="text-[#9a7300]"
                                        title="Favori"
                                      >
                                        <MailboxIcon
                                          name="star"
                                          className="size-4 fill-current"
                                        />
                                        <span className="sr-only">Favori</span>
                                      </span>
                                    )}
                                    <span className="text-xs text-[#7b8494]">
                                      {email.receivedAt}
                                    </span>
                                  </div>
                                </div>
                                <p
                                  className={`mt-1 truncate text-sm ${
                                    email.isRead
                                      ? "text-[#5f6979]"
                                      : "font-semibold text-[#394150]"
                                  }`}
                                >
                                  {email.subject || "Sans objet"}
                                </p>
                                <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#7b8494]">
                                  {email.preview || "Message vide"}
                                </p>
                                <div className="mt-3">
                                  <CategoryBadge category={email.category} />
                                </div>
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="flex min-h-64 items-center justify-center p-6 text-center">
                    <div className="max-w-xs">
                      <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-[#f1f2f4] text-[#667085]">
                        <MailboxIcon name="search" className="size-5" />
                      </div>
                      <p className="mt-4 font-semibold text-[#252b37]">
                        Aucun email trouvé
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[#667085]">
                        Modifiez la recherche, changez de filtre ou rédigez un
                        nouveau message.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <article aria-live="polite" className="min-w-0 bg-[#fcfcfd]">
                {selectedEmail ? (
                  <div className="flex h-full flex-col">
                    <div className="border-b border-[#e3e6eb] p-5 sm:p-6">
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <CategoryBadge category={selectedEmail.category} />
                          <span className="rounded-full border border-[#d9dce2] bg-white px-2.5 py-1 text-xs font-semibold text-[#526071]">
                            {VIEW_LABELS[selectedEmail.folder]}
                          </span>
                          {!selectedEmail.isRead && (
                            <span className="text-xs font-semibold text-blue-700">
                              Non lu
                            </span>
                          )}
                        </div>

                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#171717] sm:text-2xl">
                            {selectedEmail.subject || "Sans objet"}
                          </h2>
                          <button
                            type="button"
                            onClick={() =>
                              updateEmail(selectedEmail.id, {
                                isStarred: !selectedEmail.isStarred,
                              })
                            }
                            aria-label={
                              selectedEmail.isStarred
                                ? "Retirer des favoris"
                                : "Ajouter aux favoris"
                            }
                            className={`flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171717] ${
                              selectedEmail.isStarred
                                ? "border-amber-200 bg-amber-50 text-[#9a7300]"
                                : "border-[#d9dce2] bg-white text-[#667085] hover:bg-[#f1f2f4]"
                            }`}
                          >
                            <MailboxIcon
                              name="star"
                              className={`size-5 ${
                                selectedEmail.isStarred ? "fill-current" : ""
                              }`}
                            />
                          </button>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {selectedEmail.folder === "drafts" ? (
                            <ActionButton
                              icon="compose"
                              label="Modifier"
                              onClick={() => openDraft(selectedEmail)}
                            />
                          ) : (
                            <>
                              {selectedEmail.direction === "incoming" &&
                                selectedEmail.folder !== "trash" && (
                                  <ActionButton
                                    icon="reply"
                                    label="Répondre"
                                    onClick={() => openReply(selectedEmail)}
                                  />
                                )}
                              <ActionButton
                                icon="forward"
                                label="Transférer"
                                onClick={() => openForward(selectedEmail)}
                              />
                            </>
                          )}

                          {selectedEmail.folder === "inbox" && (
                            <ActionButton
                              icon="archive"
                              label="Archiver"
                              onClick={() =>
                                moveSelectedEmail(
                                  "archive",
                                  "Email archivé dans la démonstration.",
                                )
                              }
                            />
                          )}
                          {(selectedEmail.folder === "archive" ||
                            selectedEmail.folder === "trash") && (
                            <ActionButton
                              icon="restore"
                              label="Restaurer"
                              onClick={() =>
                                moveSelectedEmail(
                                  "inbox",
                                  "Email restauré dans la boîte de réception.",
                                )
                              }
                            />
                          )}
                          {selectedEmail.folder === "trash" ? (
                            <ActionButton
                              icon="trash"
                              label="Supprimer"
                              danger
                              onClick={deleteSelectedEmailPermanently}
                            />
                          ) : (
                            <ActionButton
                              icon="trash"
                              label="Corbeille"
                              danger
                              onClick={() =>
                                moveSelectedEmail(
                                  "trash",
                                  "Email placé dans la corbeille.",
                                )
                              }
                            />
                          )}
                        </div>
                      </div>

                      <div className="mt-5 flex items-center gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#e6e9ee] text-sm font-bold text-[#394150]">
                          {selectedEmail.senderName
                            .split(" ")
                            .slice(0, 2)
                            .map((part) => part[0])
                            .join("")}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#252b37]">
                            {selectedEmail.direction === "outgoing"
                              ? `À : ${selectedEmail.recipients.join(", ") || "destinataire à définir"}`
                              : selectedEmail.senderName}
                          </p>
                          <p className="truncate text-xs text-[#667085]">
                            {selectedEmail.direction === "outgoing"
                              ? `De : ${selectedEmail.sender}`
                              : selectedEmail.sender}
                          </p>
                        </div>
                        <span className="ml-auto shrink-0 text-xs text-[#7b8494]">
                          {selectedEmail.receivedAt}
                        </span>
                      </div>
                    </div>

                    <div className="flex-1 p-5 sm:p-6">
                      <p className="max-w-3xl whitespace-pre-line text-sm leading-7 text-[#394150]">
                        {selectedEmail.body || "Ce message est vide."}
                      </p>

                      {selectedEmail.direction === "incoming" &&
                        DEMO_EMAIL_IDS.has(selectedEmail.id) && (
                          <div className="mt-8 rounded-2xl border border-[#e0d5ac] bg-[#fffaf0] p-4 sm:p-5">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                              <div className="flex gap-3">
                                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#f5e8b9] text-[#6b5200]">
                                  <MailboxIcon name="sparkles" className="size-5" />
                                </div>
                                <div>
                                  <h3 className="font-semibold text-[#332a0d]">
                                    Assistant de classement
                                  </h3>
                                  <p className="mt-1 text-sm leading-6 text-[#6d5c28]">
                                    {selectedAnalysis.status === "idle" &&
                                      "Lancez Groq pour vérifier ou corriger la catégorie de cet email."}
                                    {selectedAnalysis.status === "loading" &&
                                      "Groq analyse le contenu et recherche la catégorie la plus pertinente…"}
                                    {selectedAnalysis.status === "success" &&
                                      selectedAnalysis.data.reason}
                                    {selectedAnalysis.status === "error" &&
                                      selectedAnalysis.message}
                                  </p>
                                  {selectedAnalysis.status === "success" && (
                                    <p className="mt-2 text-xs text-[#7d6d39]">
                                      Classé dans{" "}
                                      <strong>
                                        {
                                          EMAIL_CATEGORY_LABELS[
                                            selectedAnalysis.data.category
                                          ]
                                        }
                                      </strong>{" "}
                                      avec {selectedAnalysis.data.model}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={analyzeSelectedEmail}
                                disabled={selectedAnalysis.status === "loading"}
                                className="inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#171717] px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[#333333] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171717] disabled:cursor-not-allowed disabled:bg-[#9da3ae]"
                              >
                                <MailboxIcon name="sparkles" className="size-4" />
                                {selectedAnalysis.status === "loading"
                                  ? "Analyse…"
                                  : "Classer avec l’IA"}
                              </button>
                            </div>
                          </div>
                        )}

                      <div className="mt-5 grid gap-4 sm:grid-cols-2">
                        <div>
                          <label
                            htmlFor="category-selector"
                            className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8494]"
                          >
                            Catégorie
                          </label>
                          <div className="relative mt-2">
                            <select
                              id="category-selector"
                              value={selectedEmail.category}
                              onChange={(event) => {
                                updateEmail(selectedEmail.id, {
                                  category: event.target.value as EmailCategory,
                                });
                                setAnalysisState({ status: "idle" });
                              }}
                              className="min-h-11 w-full cursor-pointer appearance-none rounded-xl border border-[#d9dce2] bg-white px-3 pr-10 text-sm font-semibold text-[#394150] outline-none focus:border-[#171717] focus:ring-1 focus:ring-[#171717]"
                            >
                              {EMAIL_CATEGORIES.map((category) => (
                                <option key={category} value={category}>
                                  {EMAIL_CATEGORY_LABELS[category]}
                                </option>
                              ))}
                            </select>
                            <MailboxIcon
                              name="chevron"
                              className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 rotate-90 text-[#7b8494]"
                            />
                          </div>
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8494]">
                            État de lecture
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              updateEmail(selectedEmail.id, {
                                isRead: !selectedEmail.isRead,
                              })
                            }
                            className="mt-2 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#d9dce2] bg-white px-3 text-sm font-semibold text-[#394150] transition-colors duration-200 hover:bg-[#f7f7f8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171717]"
                          >
                            <MailboxIcon name="check" className="size-4" />
                            {selectedEmail.isRead
                              ? "Marquer comme non lu"
                              : "Marquer comme lu"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-96 items-center justify-center p-6 text-center">
                    <div>
                      <MailboxIcon
                        name="mail"
                        className="mx-auto size-8 text-[#98a0ad]"
                      />
                      <p className="mt-4 font-semibold text-[#394150]">
                        Sélectionnez un email
                      </p>
                    </div>
                  </div>
                )}
              </article>
            </div>
          </section>
        </main>
      </div>

      {composerSession && (
        <EmailComposer
          session={composerSession}
          onClose={() => setComposerSession(null)}
          onSaveDraft={saveDraft}
          onSend={sendMessage}
        />
      )}

      {toast && (
        <div
          role={toast.tone === "error" ? "alert" : "status"}
          className={`fixed bottom-4 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 rounded-xl border px-4 py-3 text-sm font-semibold sm:bottom-6 ${
            toast.tone === "error"
              ? "border-red-200 bg-red-50 text-red-900"
              : toast.tone === "info"
                ? "border-blue-200 bg-blue-50 text-blue-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-900"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
