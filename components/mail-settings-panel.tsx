"use client";

import { useEffect, useState, type FormEvent } from "react";

import { MailboxIcon } from "@/components/mailbox-icon";
import type { GmailLabelSummary } from "@/types/gmail";
import type { MailPreferences, MailSettingsData, MailSettingsResponse } from "@/types/settings";

type Props = {
  open: boolean;
  settings: MailSettingsData;
  labels: GmailLabelSummary[];
  onClose: () => void;
  onChange: (settings: MailSettingsData) => void;
};

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(window.atob(base64), (character) => character.charCodeAt(0));
}

export function MailSettingsPanel({ open, settings, labels, onClose, onChange }: Props) {
  const [preferences, setPreferences] = useState<MailPreferences>(settings.preferences);
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [template, setTemplate] = useState({ name: "", subject: "", body: "" });
  const [rule, setRule] = useState({ name: "", senderContains: "", subjectContains: "", labelId: "" });

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const listener = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", listener);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", listener);
    };
  }, [onClose, open]);

  if (!open) return null;

  async function requestSettings(url: string, init: RequestInit) {
    const response = await fetch(url, init);
    const payload = (await response.json()) as MailSettingsResponse;
    if (!response.ok || !payload.success) throw new Error(payload.success ? "Réponse incomplète." : payload.error);
    onChange(payload.data);
    setPreferences(payload.data.preferences);
    return payload.data;
  }

  async function savePreferences(event: FormEvent) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");
    try {
      await requestSettings("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preferences),
      });
      setStatus("success");
      setMessage("Préférences enregistrées sur le serveur.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Enregistrement impossible.");
    }
  }

  async function setPushNotifications(enabled: boolean) {
    setStatus("saving");
    setMessage("");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("Ce navigateur ne prend pas en charge les notifications push.");
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      const current = await registration.pushManager.getSubscription();
      if (enabled) {
        if (!settings.vapidPublicKey) throw new Error("Les clés Web Push ne sont pas configurées.");
        const permission = await Notification.requestPermission();
        if (permission !== "granted") throw new Error("L’autorisation de notification a été refusée.");
        const subscription = current ?? await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(settings.vapidPublicKey),
        });
        const response = await fetch("/api/notifications/subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(subscription.toJSON()),
        });
        if (!response.ok) throw new Error("L’abonnement push n’a pas pu être enregistré.");
      } else if (current) {
        await fetch("/api/notifications/subscription", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: current.endpoint }),
        });
        await current.unsubscribe();
      }
      const next = { ...preferences, notificationsEnabled: enabled };
      setPreferences(next);
      await requestSettings("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      setStatus("success");
      setMessage(enabled ? "Notifications importantes activées." : "Notifications désactivées.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Notifications indisponibles.");
    }
  }

  async function createItem(kind: "template" | "rule") {
    setStatus("saving");
    setMessage("");
    try {
      await requestSettings("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, ...(kind === "template" ? template : rule) }),
      });
      if (kind === "template") setTemplate({ name: "", subject: "", body: "" });
      else setRule({ name: "", senderContains: "", subjectContains: "", labelId: "" });
      setStatus("success");
      setMessage(kind === "template" ? "Modèle créé." : "Règle automatique créée.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Création impossible.");
    }
  }

  async function removeItem(kind: "template" | "rule", id: string) {
    setStatus("saving");
    try {
      await requestSettings(`/api/settings?kind=${kind}&id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setStatus("success");
      setMessage("Élément supprimé.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Suppression impossible.");
    }
  }

  const userLabels = labels.filter((label) => label.type === "user");
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-6">
      <section role="dialog" aria-modal="true" aria-labelledby="settings-title" className="flex max-h-[100dvh] w-full max-w-4xl flex-col bg-white sm:max-h-[92dvh] sm:rounded-2xl sm:border sm:border-[#d9dce2]">
        <header className="flex min-h-16 items-center justify-between border-b border-[#e4e4e7] px-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-blue-700">Configuration serveur</p>
            <h2 id="settings-title" className="font-semibold text-[#18181b]">Préférences, signatures et règles</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer les préférences" className="flex size-11 cursor-pointer items-center justify-center rounded-xl text-[#52525b] transition-colors hover:bg-[#f4f4f5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
            <MailboxIcon name="close" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {!settings.databaseReady ? (
            <p role="alert" className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-950">Ajoutez DATABASE_URL pour rendre ces réglages permanents.</p>
          ) : null}
          {message ? (
            <p role={status === "error" ? "alert" : "status"} className={`mb-5 rounded-xl border p-3 text-sm font-semibold ${status === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>{message}</p>
          ) : null}

          <form onSubmit={savePreferences} className="grid gap-5 rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <h3 className="font-semibold text-[#18181b]">Comportement général</h3>
              <p className="mt-1 text-sm text-[#52525b]">Ces choix suivent le compte sur tous les appareils.</p>
            </div>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-[#d4d4d8] bg-white px-3 text-sm font-semibold">
              <input type="checkbox" checked={preferences.autoTriage} onChange={(event) => setPreferences((current) => ({ ...current, autoTriage: event.target.checked }))} className="size-5 accent-blue-700" />
              Classer automatiquement les nouveaux emails
            </label>
            <label className="block text-sm font-semibold text-[#3f3f46]">
              Délai d’annulation d’envoi
              <select value={preferences.undoSendSeconds} onChange={(event) => setPreferences((current) => ({ ...current, undoSendSeconds: Number(event.target.value) }))} className="mt-2 min-h-12 w-full cursor-pointer rounded-xl border border-[#d4d4d8] bg-white px-3 text-base outline-none focus:border-blue-700 focus:ring-1 focus:ring-blue-700">
                <option value={0}>Désactivé</option><option value={5}>5 secondes</option><option value={10}>10 secondes</option><option value={20}>20 secondes</option><option value={30}>30 secondes</option>
              </select>
            </label>
            <label className="sm:col-span-2 block text-sm font-semibold text-[#3f3f46]">
              Signature
              <textarea rows={4} maxLength={5_000} value={preferences.signature} onChange={(event) => setPreferences((current) => ({ ...current, signature: event.target.value }))} placeholder="Nom, fonction, téléphone…" className="mt-2 w-full rounded-xl border border-[#d4d4d8] bg-white px-3 py-3 text-base leading-6 outline-none focus:border-blue-700 focus:ring-1 focus:ring-blue-700" />
            </label>
            <label className="sm:col-span-2 block text-sm font-semibold text-[#3f3f46]">
              Style de rédaction transmis à Groq
              <textarea rows={3} maxLength={500} value={preferences.writingStyle} onChange={(event) => setPreferences((current) => ({ ...current, writingStyle: event.target.value }))} className="mt-2 w-full rounded-xl border border-[#d4d4d8] bg-white px-3 py-3 text-base leading-6 outline-none focus:border-blue-700 focus:ring-1 focus:ring-blue-700" />
            </label>
            <div className="sm:col-span-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" onClick={() => void setPushNotifications(!preferences.notificationsEnabled)} disabled={status === "saving"} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 text-sm font-semibold text-blue-900 transition-colors hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-wait disabled:opacity-60">
                <MailboxIcon name="bell" className="size-4" />
                {preferences.notificationsEnabled ? "Désactiver les notifications" : "Activer les notifications importantes"}
              </button>
              <button type="submit" disabled={status === "saving" || !settings.databaseReady} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900 disabled:cursor-wait disabled:opacity-50">
                <MailboxIcon name="check" className="size-4" /> Enregistrer
              </button>
            </div>
          </form>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <section className="rounded-2xl border border-[#e4e4e7] p-4">
              <h3 className="font-semibold">Modèles de messages</h3>
              <div className="mt-3 grid gap-3">
                <input aria-label="Nom du modèle" placeholder="Nom du modèle" value={template.name} onChange={(event) => setTemplate((current) => ({ ...current, name: event.target.value }))} className="min-h-11 rounded-xl border border-[#d4d4d8] px-3 text-base outline-none focus:border-blue-700" />
                <input aria-label="Objet du modèle" placeholder="Objet" value={template.subject} onChange={(event) => setTemplate((current) => ({ ...current, subject: event.target.value }))} className="min-h-11 rounded-xl border border-[#d4d4d8] px-3 text-base outline-none focus:border-blue-700" />
                <textarea aria-label="Contenu du modèle" rows={4} placeholder="Contenu du message" value={template.body} onChange={(event) => setTemplate((current) => ({ ...current, body: event.target.value }))} className="rounded-xl border border-[#d4d4d8] px-3 py-2 text-base outline-none focus:border-blue-700" />
                <button type="button" onClick={() => void createItem("template")} disabled={!template.name.trim() || !template.body.trim() || status === "saving" || !settings.databaseReady} className="min-h-11 cursor-pointer rounded-xl bg-[#18181b] px-4 text-sm font-semibold text-white hover:bg-[#3f3f46] disabled:cursor-not-allowed disabled:opacity-50">Créer le modèle</button>
              </div>
              <ul className="mt-4 grid gap-2">
                {settings.templates.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-[#f4f4f5] px-3 py-2"><span className="truncate text-sm font-semibold">{item.name}</span><button type="button" onClick={() => void removeItem("template", item.id)} aria-label={`Supprimer ${item.name}`} className="flex size-11 cursor-pointer items-center justify-center rounded-lg text-red-800 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-800"><MailboxIcon name="trash" className="size-4" /></button></li>)}
              </ul>
            </section>

            <section className="rounded-2xl border border-[#e4e4e7] p-4">
              <h3 className="font-semibold">Règles automatiques</h3>
              <div className="mt-3 grid gap-3">
                <input aria-label="Nom de la règle" placeholder="Nom de la règle" value={rule.name} onChange={(event) => setRule((current) => ({ ...current, name: event.target.value }))} className="min-h-11 rounded-xl border border-[#d4d4d8] px-3 text-base outline-none focus:border-blue-700" />
                <input aria-label="Expéditeur contient" placeholder="Expéditeur contient…" value={rule.senderContains} onChange={(event) => setRule((current) => ({ ...current, senderContains: event.target.value }))} className="min-h-11 rounded-xl border border-[#d4d4d8] px-3 text-base outline-none focus:border-blue-700" />
                <input aria-label="Objet contient" placeholder="Objet contient…" value={rule.subjectContains} onChange={(event) => setRule((current) => ({ ...current, subjectContains: event.target.value }))} className="min-h-11 rounded-xl border border-[#d4d4d8] px-3 text-base outline-none focus:border-blue-700" />
                <select aria-label="Dossier de destination" value={rule.labelId} onChange={(event) => setRule((current) => ({ ...current, labelId: event.target.value }))} className="min-h-11 cursor-pointer rounded-xl border border-[#d4d4d8] bg-white px-3 text-base outline-none focus:border-blue-700"><option value="">Choisir un dossier</option>{userLabels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}</select>
                <button type="button" onClick={() => void createItem("rule")} disabled={!rule.name.trim() || (!rule.senderContains.trim() && !rule.subjectContains.trim()) || !rule.labelId || status === "saving" || !settings.databaseReady} className="min-h-11 cursor-pointer rounded-xl bg-[#18181b] px-4 text-sm font-semibold text-white hover:bg-[#3f3f46] disabled:cursor-not-allowed disabled:opacity-50">Créer la règle</button>
              </div>
              <ul className="mt-4 grid gap-2">{settings.rules.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-[#f4f4f5] px-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-semibold">{item.name}</p><p className="truncate text-xs text-[#52525b]">{item.senderContains ? `De : ${item.senderContains}` : `Objet : ${item.subjectContains}`}</p></div><button type="button" onClick={() => void removeItem("rule", item.id)} aria-label={`Supprimer ${item.name}`} className="flex size-11 cursor-pointer items-center justify-center rounded-lg text-red-800 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-800"><MailboxIcon name="trash" className="size-4" /></button></li>)}</ul>
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}
