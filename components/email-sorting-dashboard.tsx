"use client";

import { useMemo, useState } from "react";

import { DEMO_EMAILS } from "@/lib/demo-emails";
import { EMAIL_CATEGORY_LABELS } from "@/lib/email-categories";
import {
  EMAIL_CATEGORIES,
  type ClassifyEmailResponse,
  type EmailCategory,
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

type IconName =
  | "check"
  | "chevron"
  | "mail"
  | "search"
  | "sparkles"
  | "star";

function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, string> = {
    check: "m5 12 4 4L19 6",
    chevron: "m9 18 6-6-6-6",
    mail: "M3.75 6.75 12 12l8.25-5.25M5.25 19.5h13.5A2.25 2.25 0 0 0 21 17.25V6.75a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Z",
    search: "m21 21-4.35-4.35m1.35-5.4a6.75 6.75 0 1 1-13.5 0 6.75 6.75 0 0 1 13.5 0Z",
    sparkles: "M9.75 3.75 8.1 8.7l-4.35 1.8 4.35 1.8 1.65 4.95 1.65-4.95 4.35-1.8-4.35-1.8-1.65-4.95Zm7.5 10.5-.9 2.7-2.35.98 2.35.97.9 2.7.9-2.7 2.35-.97-2.35-.98-.9-2.7Z",
    star: "m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 16.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3Z",
  };

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={paths[name]} />
    </svg>
  );
}

function CategoryBadge({ category }: { category: EmailCategory }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${CATEGORY_VISUALS[category].badge}`}
    >
      {EMAIL_CATEGORY_LABELS[category]}
    </span>
  );
}

export function EmailSortingDashboard() {
  const [emails, setEmails] = useState<OrganizerEmail[]>(DEMO_EMAILS);
  const [selectedEmailId, setSelectedEmailId] = useState(DEMO_EMAILS[0].id);
  const [activeCategory, setActiveCategory] =
    useState<CategoryFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [analysisState, setAnalysisState] = useState<AnalysisState>({
    status: "idle",
  });

  const categoryCounts = useMemo(
    () =>
      Object.fromEntries(
        EMAIL_CATEGORIES.map((category) => [
          category,
          emails.filter((email) => email.category === category).length,
        ]),
      ) as Record<EmailCategory, number>,
    [emails],
  );

  const visibleEmails = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase("fr-FR");
    const filteredEmails = emails.filter((email) => {
      const matchesCategory =
        activeCategory === "all" || email.category === activeCategory;
      const matchesSearch =
        normalizedQuery.length === 0 ||
        [email.senderName, email.sender, email.subject, email.preview].some(
          (value) => value.toLocaleLowerCase("fr-FR").includes(normalizedQuery),
        );

      return matchesCategory && matchesSearch;
    });

    if (sortMode === "unread") {
      return [...filteredEmails].sort(
        (firstEmail, secondEmail) =>
          Number(firstEmail.isRead) - Number(secondEmail.isRead),
      );
    }

    return filteredEmails;
  }, [activeCategory, emails, searchQuery, sortMode]);

  const selectedEmail =
    visibleEmails.find((email) => email.id === selectedEmailId) ??
    visibleEmails[0] ??
    null;

  const unreadCount = emails.filter((email) => !email.isRead).length;
  const starredCount = emails.filter((email) => email.isStarred).length;

  function selectEmail(emailId: string) {
    setSelectedEmailId(emailId);
    setAnalysisState({ status: "idle" });
  }

  function filterByCategory(category: CategoryFilter) {
    setActiveCategory(category);
    setAnalysisState({ status: "idle" });
  }

  function updateSelectedEmail(changes: Partial<OrganizerEmail>) {
    if (!selectedEmail) {
      return;
    }

    setEmails((currentEmails) =>
      currentEmails.map((email) =>
        email.id === selectedEmail.id ? { ...email, ...changes } : email,
      ),
    );
  }

  function resetDemo() {
    setEmails(DEMO_EMAILS);
    setSelectedEmailId(DEMO_EMAILS[0].id);
    setActiveCategory("all");
    setSearchQuery("");
    setSortMode("recent");
    setAnalysisState({ status: "idle" });
  }

  async function analyzeSelectedEmail() {
    if (!selectedEmail) {
      return;
    }

    const emailToAnalyze = selectedEmail;
    setAnalysisState({ status: "loading", emailId: emailToAnalyze.id });

    try {
      const response = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: emailToAnalyze.sender,
          subject: emailToAnalyze.subject,
          body: emailToAnalyze.body,
        }),
      });
      const payload = (await response.json()) as ClassifyEmailResponse;

      if (!response.ok || !payload.success) {
        throw new Error(
          payload.success
            ? "La route API a retourné une réponse inattendue."
            : payload.error,
        );
      }

      setEmails((currentEmails) =>
        currentEmails.map((email) =>
          email.id === emailToAnalyze.id
            ? { ...email, category: payload.data.category }
            : email,
        ),
      );
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
        <div className="mx-auto flex min-h-18 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#171717] text-white">
              <Icon name="mail" className="size-5" />
            </div>
            <div>
              <p className="font-semibold tracking-[-0.02em] text-[#171717]">
                Email Organizer AI
              </p>
              <p className="text-xs text-[#667085]">Espace de tri intelligent</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 sm:inline-flex">
              <span className="size-2 rounded-full bg-amber-500" />
              Mode démonstration
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

      <div className="mx-auto grid max-w-[1600px] lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden border-r border-[#e3e6eb] bg-white px-4 py-6 lg:flex lg:min-h-[calc(100vh-73px)] lg:flex-col">
          <nav aria-label="Navigation des emails">
            <p className="px-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8494]">
              Espace
            </p>
            <button
              type="button"
              onClick={() => filterByCategory("all")}
              aria-current={activeCategory === "all" ? "page" : undefined}
              className={`mt-3 flex min-h-11 w-full cursor-pointer items-center justify-between rounded-xl px-3 text-left text-sm font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171717] ${
                activeCategory === "all"
                  ? "bg-[#171717] text-white"
                  : "text-[#4d5768] hover:bg-[#f2f3f5] hover:text-[#171717]"
              }`}
            >
              <span>Boîte de réception</span>
              <span
                className={
                  activeCategory === "all" ? "text-white/70" : "text-[#8a93a3]"
                }
              >
                {emails.length}
              </span>
            </button>

            <p className="mt-8 px-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8494]">
              Catégories
            </p>
            <div className="mt-3 space-y-1">
              {EMAIL_CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => filterByCategory(category)}
                  aria-current={
                    activeCategory === category ? "page" : undefined
                  }
                  className={`flex min-h-11 w-full cursor-pointer items-center justify-between rounded-xl px-3 text-left text-sm transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171717] ${
                    activeCategory === category
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
              <Icon name="sparkles" className="size-4" />
            </div>
            <p className="mt-4 text-sm font-semibold text-[#252b37]">
              Données fictives
            </p>
            <p className="mt-1 text-xs leading-5 text-[#667085]">
              Cette version personnelle utilise uniquement des exemples. Aucun
              compte Gmail ni mot de passe n’est nécessaire.
            </p>
          </div>
        </aside>

        <main id="main-content" className="min-w-0 p-4 sm:p-6 xl:p-8">
          <section aria-labelledby="dashboard-title">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[#826408]">
                  Tableau de bord
                </p>
                <h1
                  id="dashboard-title"
                  className="mt-1 text-3xl font-semibold tracking-[-0.035em] text-[#171717] sm:text-4xl"
                >
                  Votre boîte, enfin organisée.
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[#667085] sm:text-base">
                  Recherchez, filtrez et classez des emails fictifs avec Groq,
                  directement dans votre espace de démonstration.
                </p>
              </div>
              <button
                type="button"
                onClick={analyzeSelectedEmail}
                disabled={!selectedEmail || selectedAnalysis.status === "loading"}
                className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#d4af37] px-4 text-sm font-semibold text-[#171717] transition-colors duration-200 hover:bg-[#c59f25] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171717] disabled:cursor-not-allowed disabled:bg-[#d9dbe0] disabled:text-[#697386]"
              >
                <Icon name="sparkles" className="size-4" />
                {selectedAnalysis.status === "loading"
                  ? "Analyse en cours…"
                  : "Analyser l’email sélectionné"}
              </button>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[
                { label: "Emails affichés", value: emails.length, detail: "Données de démonstration" },
                { label: "Non lus", value: unreadCount, detail: "À consulter" },
                { label: "Prioritaires", value: starredCount, detail: "Marqués d’une étoile" },
                { label: "À classer", value: categoryCounts.other, detail: "En attente de l’IA" },
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
            aria-label="Interface de tri des emails"
            className="mt-6 overflow-hidden rounded-2xl border border-[#e3e6eb] bg-white"
          >
            <div className="flex flex-col gap-3 border-b border-[#e3e6eb] p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
              <div className="relative min-w-0 flex-1 sm:max-w-md">
                <label htmlFor="email-search" className="sr-only">
                  Rechercher dans les emails
                </label>
                <Icon
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

              <div className="grid grid-cols-2 gap-2 sm:flex">
                <div className="relative lg:hidden">
                  <label htmlFor="mobile-category-filter" className="sr-only">
                    Filtrer par catégorie
                  </label>
                  <select
                    id="mobile-category-filter"
                    value={activeCategory}
                    onChange={(event) =>
                      filterByCategory(event.target.value as CategoryFilter)
                    }
                    className="min-h-11 w-full cursor-pointer appearance-none rounded-xl border border-[#d9dce2] bg-white px-3 pr-9 text-sm font-medium text-[#394150] outline-none focus:border-[#171717] focus:ring-1 focus:ring-[#171717]"
                  >
                    <option value="all">Toutes les catégories</option>
                    {EMAIL_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {EMAIL_CATEGORY_LABELS[category]}
                      </option>
                    ))}
                  </select>
                  <Icon
                    name="chevron"
                    className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 rotate-90 text-[#7b8494]"
                  />
                </div>

                <div className="relative">
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
                  <Icon
                    name="chevron"
                    className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 rotate-90 text-[#7b8494]"
                  />
                </div>
              </div>
            </div>

            <div className="grid min-h-[620px] xl:grid-cols-[minmax(0,0.92fr)_minmax(380px,1.08fr)]">
              <div className="border-b border-[#e3e6eb] xl:border-b-0 xl:border-r">
                <div className="flex items-center justify-between border-b border-[#e3e6eb] px-4 py-3">
                  <p className="text-sm font-semibold text-[#394150]">
                    {activeCategory === "all"
                      ? "Tous les emails"
                      : EMAIL_CATEGORY_LABELS[activeCategory]}
                  </p>
                  <span className="text-xs text-[#7b8494]">
                    {visibleEmails.length} résultat
                    {visibleEmails.length > 1 ? "s" : ""}
                  </span>
                </div>

                {visibleEmails.length > 0 ? (
                  <ul className="max-h-[620px] divide-y divide-[#eceef1] overflow-y-auto">
                    {visibleEmails.map((email) => {
                      const isSelected = email.id === selectedEmail?.id;

                      return (
                        <li key={email.id}>
                          <button
                            type="button"
                            onClick={() => selectEmail(email.id)}
                            aria-pressed={isSelected}
                            className={`w-full cursor-pointer px-4 py-4 text-left transition-colors duration-200 focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#171717] sm:px-5 ${
                              isSelected
                                ? "bg-[#f5f0df]"
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
                                    {email.senderName}
                                  </p>
                                  <div className="flex shrink-0 items-center gap-2">
                                    {email.isStarred && (
                                      <span className="text-[#9a7300]" title="Prioritaire">
                                        <Icon name="star" className="size-4 fill-current" />
                                        <span className="sr-only">Prioritaire</span>
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
                                  {email.subject}
                                </p>
                                <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#7b8494]">
                                  {email.preview}
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
                        <Icon name="search" className="size-5" />
                      </div>
                      <p className="mt-4 font-semibold text-[#252b37]">
                        Aucun email trouvé
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[#667085]">
                        Modifiez votre recherche ou choisissez une autre
                        catégorie.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <article aria-live="polite" className="min-w-0 bg-[#fcfcfd]">
                {selectedEmail ? (
                  <div className="flex h-full flex-col">
                    <div className="border-b border-[#e3e6eb] p-5 sm:p-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <CategoryBadge category={selectedEmail.category} />
                            {!selectedEmail.isRead && (
                              <span className="text-xs font-semibold text-blue-700">
                                Non lu
                              </span>
                            )}
                          </div>
                          <h2 className="mt-4 text-xl font-semibold tracking-[-0.02em] text-[#171717] sm:text-2xl">
                            {selectedEmail.subject}
                          </h2>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            updateSelectedEmail({ isRead: !selectedEmail.isRead })
                          }
                          className="inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#d9dce2] bg-white px-3 text-sm font-semibold text-[#394150] transition-colors duration-200 hover:border-[#aeb4bf] hover:bg-[#f7f7f8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171717]"
                        >
                          <Icon name="check" className="size-4" />
                          {selectedEmail.isRead ? "Marquer non lu" : "Marquer comme lu"}
                        </button>
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
                            {selectedEmail.senderName}
                          </p>
                          <p className="truncate text-xs text-[#667085]">
                            {selectedEmail.sender}
                          </p>
                        </div>
                        <span className="ml-auto shrink-0 text-xs text-[#7b8494]">
                          {selectedEmail.receivedAt}
                        </span>
                      </div>
                    </div>

                    <div className="flex-1 p-5 sm:p-6">
                      <p className="whitespace-pre-line text-sm leading-7 text-[#394150]">
                        {selectedEmail.body}
                      </p>

                      <div className="mt-8 rounded-2xl border border-[#e0d5ac] bg-[#fffaf0] p-4 sm:p-5">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex gap-3">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#f5e8b9] text-[#6b5200]">
                              <Icon name="sparkles" className="size-5" />
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
                                    {EMAIL_CATEGORY_LABELS[
                                      selectedAnalysis.data.category
                                    ]}
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
                            {selectedAnalysis.status === "loading" ? (
                              <span
                                aria-hidden="true"
                                className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none"
                              />
                            ) : (
                              <Icon name="sparkles" className="size-4" />
                            )}
                            {selectedAnalysis.status === "loading"
                              ? "Analyse…"
                              : "Analyser avec l’IA"}
                          </button>
                        </div>
                      </div>

                      <div className="mt-5">
                        <label
                          htmlFor="category-selector"
                          className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8494]"
                        >
                          Déplacer manuellement vers
                        </label>
                        <div className="relative mt-2 max-w-xs">
                          <select
                            id="category-selector"
                            value={selectedEmail.category}
                            onChange={(event) => {
                              updateSelectedEmail({
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
                          <Icon
                            name="chevron"
                            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 rotate-90 text-[#7b8494]"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-96 items-center justify-center p-6 text-center">
                    <div>
                      <Icon name="mail" className="mx-auto size-8 text-[#98a0ad]" />
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
    </div>
  );
}
