import "server-only";

import { randomUUID } from "node:crypto";

import { databaseQuery, isDatabaseConfigured } from "@/lib/database";
import { decryptServerSecret, encryptServerSecret } from "@/lib/secret-crypto";
import { refreshGoogleAccessToken } from "@/lib/google-oauth";
import type {
  MailPreferences,
  MailRule,
  MailSettingsData,
  MailTemplate,
} from "@/types/settings";

export const DEFAULT_MAIL_PREFERENCES: MailPreferences = {
  autoTriage: true,
  writingStyle: "",
  signature: "",
  undoSendSeconds: 10,
  notificationsEnabled: false,
};

type PreferenceRow = {
  auto_triage: boolean;
  writing_style: string;
  signature: string;
  undo_send_seconds: number;
  notifications_enabled: boolean;
};
type TemplateRow = { id: string; name: string; subject: string; body: string };
type RuleRow = {
  id: string;
  name: string;
  sender_contains: string;
  subject_contains: string;
  label_id: string;
  enabled: boolean;
};

function normalizeEmail(email: string) {
  return email.trim().toLocaleLowerCase("en-US");
}

export async function persistGoogleRefreshToken(email: string, refreshToken: string) {
  if (!isDatabaseConfigured() || !refreshToken) return;
  await databaseQuery(
    `INSERT INTO email_organizer_accounts (email, encrypted_refresh_token)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET
       encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
       updated_at = NOW()`,
    [normalizeEmail(email), encryptServerSecret(refreshToken)],
  );
}

export async function getStoredGoogleAccessToken(email: string) {
  const result = await databaseQuery<{ encrypted_refresh_token: string }>(
    `SELECT encrypted_refresh_token FROM email_organizer_accounts WHERE email = $1`,
    [normalizeEmail(email)],
  );
  const encrypted = result.rows[0]?.encrypted_refresh_token;
  if (!encrypted) throw new Error("Aucun jeton Google serveur n'est disponible.");
  const refreshToken = decryptServerSecret(encrypted);
  const tokens = await refreshGoogleAccessToken(refreshToken);
  if (tokens.refreshToken) await persistGoogleRefreshToken(email, tokens.refreshToken);
  return tokens.accessToken;
}

export async function getMailSettings(email: string): Promise<MailSettingsData> {
  if (!isDatabaseConfigured()) {
    return {
      databaseReady: false,
      preferences: DEFAULT_MAIL_PREFERENCES,
      templates: [],
      rules: [],
      vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "",
    };
  }
  const normalized = normalizeEmail(email);
  await databaseQuery(
    `INSERT INTO email_organizer_preferences (email) VALUES ($1)
     ON CONFLICT (email) DO NOTHING`,
    [normalized],
  );
  const [preferences, templates, rules] = await Promise.all([
    databaseQuery<PreferenceRow>(
      `SELECT auto_triage, writing_style, signature, undo_send_seconds, notifications_enabled
       FROM email_organizer_preferences WHERE email = $1`,
      [normalized],
    ),
    databaseQuery<TemplateRow>(
      `SELECT id::text, name, subject, body FROM email_organizer_templates
       WHERE email = $1 ORDER BY name ASC`,
      [normalized],
    ),
    databaseQuery<RuleRow>(
      `SELECT id::text, name, sender_contains, subject_contains, label_id, enabled
       FROM email_organizer_rules WHERE email = $1 ORDER BY name ASC`,
      [normalized],
    ),
  ]);
  const row = preferences.rows[0];
  return {
    databaseReady: true,
    preferences: row
      ? {
          autoTriage: row.auto_triage,
          writingStyle: row.writing_style,
          signature: row.signature,
          undoSendSeconds: row.undo_send_seconds,
          notificationsEnabled: row.notifications_enabled,
        }
      : DEFAULT_MAIL_PREFERENCES,
    templates: templates.rows.map((item): MailTemplate => ({ ...item })),
    rules: rules.rows.map(
      (item): MailRule => ({
        id: item.id,
        name: item.name,
        senderContains: item.sender_contains,
        subjectContains: item.subject_contains,
        labelId: item.label_id,
        enabled: item.enabled,
      }),
    ),
    vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "",
  };
}

export async function saveMailPreferences(email: string, preferences: MailPreferences) {
  await databaseQuery(
    `INSERT INTO email_organizer_preferences
       (email, auto_triage, writing_style, signature, undo_send_seconds, notifications_enabled)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (email) DO UPDATE SET
       auto_triage = EXCLUDED.auto_triage,
       writing_style = EXCLUDED.writing_style,
       signature = EXCLUDED.signature,
       undo_send_seconds = EXCLUDED.undo_send_seconds,
       notifications_enabled = EXCLUDED.notifications_enabled,
       updated_at = NOW()`,
    [
      normalizeEmail(email),
      preferences.autoTriage,
      preferences.writingStyle,
      preferences.signature,
      preferences.undoSendSeconds,
      preferences.notificationsEnabled,
    ],
  );
}

export async function createMailTemplate(
  email: string,
  template: Omit<MailTemplate, "id">,
) {
  const result = await databaseQuery<TemplateRow>(
    `INSERT INTO email_organizer_templates (email, name, subject, body)
     VALUES ($1, $2, $3, $4)
     RETURNING id::text, name, subject, body`,
    [normalizeEmail(email), template.name, template.subject, template.body],
  );
  return result.rows[0];
}

export async function deleteMailTemplate(email: string, id: string) {
  await databaseQuery(
    `DELETE FROM email_organizer_templates WHERE email = $1 AND id = $2::bigint`,
    [normalizeEmail(email), id],
  );
}

export async function createMailRule(email: string, rule: Omit<MailRule, "id">) {
  const result = await databaseQuery<RuleRow>(
    `INSERT INTO email_organizer_rules
       (email, name, sender_contains, subject_contains, label_id, enabled)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id::text, name, sender_contains, subject_contains, label_id, enabled`,
    [
      normalizeEmail(email),
      rule.name,
      rule.senderContains,
      rule.subjectContains,
      rule.labelId,
      rule.enabled,
    ],
  );
  const row = result.rows[0];
  return row
    ? {
        id: row.id,
        name: row.name,
        senderContains: row.sender_contains,
        subjectContains: row.subject_contains,
        labelId: row.label_id,
        enabled: row.enabled,
      }
    : null;
}

export async function deleteMailRule(email: string, id: string) {
  await databaseQuery(
    `DELETE FROM email_organizer_rules WHERE email = $1 AND id = $2::bigint`,
    [normalizeEmail(email), id],
  );
}

export async function listEnabledMailRules(email: string) {
  const settings = await getMailSettings(email);
  return settings.rules.filter((rule) => rule.enabled);
}

export async function scheduleGmailDraft(
  email: string,
  gmailDraftId: string,
  scheduledFor: Date,
) {
  const id = randomUUID();
  await databaseQuery(
    `INSERT INTO email_organizer_scheduled_messages
       (id, email, gmail_draft_id, scheduled_for)
     VALUES ($1, $2, $3, $4)`,
    [id, normalizeEmail(email), gmailDraftId, scheduledFor],
  );
  return id;
}

export async function cancelScheduledMessage(email: string, id: string) {
  const result = await databaseQuery<{ gmail_draft_id: string }>(
    `UPDATE email_organizer_scheduled_messages
     SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND email = $2 AND status = 'pending'
     RETURNING gmail_draft_id`,
    [id, normalizeEmail(email)],
  );
  return result.rows[0] ?? null;
}

export async function claimScheduledMessage(email: string, id: string) {
  const result = await databaseQuery<{
    id: string;
    email: string;
    gmail_draft_id: string;
  }>(
    `UPDATE email_organizer_scheduled_messages
     SET status = 'processing', updated_at = NOW()
     WHERE id = $1 AND email = $2 AND status = 'pending' AND scheduled_for <= NOW()
     RETURNING id, email, gmail_draft_id`,
    [id, normalizeEmail(email)],
  );
  const row = result.rows[0];
  return row
    ? { id: row.id, email: row.email, gmailDraftId: row.gmail_draft_id }
    : null;
}

export async function createReminder(input: {
  email: string;
  messageId: string;
  kind: "snooze" | "reminder";
  remindAt: Date;
  snoozeLabelId?: string;
}) {
  const id = randomUUID();
  await databaseQuery(
    `INSERT INTO email_organizer_reminders
       (id, email, gmail_message_id, kind, remind_at, snooze_label_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      normalizeEmail(input.email),
      input.messageId,
      input.kind,
      input.remindAt,
      input.snoozeLabelId ?? null,
    ],
  );
  return id;
}

export async function savePushSubscription(
  email: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
) {
  await databaseQuery(
    `INSERT INTO email_organizer_push_subscriptions (email, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET
       email = EXCLUDED.email, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [normalizeEmail(email), subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth],
  );
}

export async function deletePushSubscription(email: string, endpoint: string) {
  await databaseQuery(
    `DELETE FROM email_organizer_push_subscriptions WHERE email = $1 AND endpoint = $2`,
    [normalizeEmail(email), endpoint],
  );
}

export async function createNotification(input: {
  email: string;
  gmailMessageId?: string;
  title: string;
  body: string;
}) {
  const id = randomUUID();
  await databaseQuery(
    `INSERT INTO email_organizer_notifications
       (id, email, gmail_message_id, title, body)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, normalizeEmail(input.email), input.gmailMessageId ?? null, input.title, input.body],
  );
  return id;
}

export type DueScheduledMessage = {
  id: string;
  email: string;
  gmailDraftId: string;
};

export async function claimDueScheduledMessages(limit = 20) {
  const result = await databaseQuery<{
    id: string;
    email: string;
    gmail_draft_id: string;
  }>(
    `UPDATE email_organizer_scheduled_messages AS scheduled
     SET status = 'processing', updated_at = NOW()
     WHERE scheduled.id IN (
       SELECT id FROM email_organizer_scheduled_messages
       WHERE status = 'pending' AND scheduled_for <= NOW()
       ORDER BY scheduled_for ASC LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING scheduled.id, scheduled.email, scheduled.gmail_draft_id`,
    [limit],
  );
  return result.rows.map(
    (row): DueScheduledMessage => ({
      id: row.id,
      email: row.email,
      gmailDraftId: row.gmail_draft_id,
    }),
  );
}

export async function finishScheduledMessage(id: string, error?: string) {
  await databaseQuery(
    `UPDATE email_organizer_scheduled_messages
     SET status = $2, error = $3, updated_at = NOW() WHERE id = $1`,
    [id, error ? "failed" : "sent", error?.slice(0, 500) ?? null],
  );
}

export type DueReminder = {
  id: string;
  email: string;
  gmailMessageId: string;
  kind: "snooze" | "reminder";
  snoozeLabelId?: string;
};

export async function claimDueReminders(limit = 50) {
  const result = await databaseQuery<{
    id: string;
    email: string;
    gmail_message_id: string;
    kind: "snooze" | "reminder";
    snooze_label_id: string | null;
  }>(
    `UPDATE email_organizer_reminders AS reminder
     SET status = 'processing', updated_at = NOW()
     WHERE reminder.id IN (
       SELECT id FROM email_organizer_reminders
       WHERE status = 'pending' AND remind_at <= NOW()
       ORDER BY remind_at ASC LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING reminder.id, reminder.email, reminder.gmail_message_id,
       reminder.kind, reminder.snooze_label_id`,
    [limit],
  );
  return result.rows.map(
    (row): DueReminder => ({
      id: row.id,
      email: row.email,
      gmailMessageId: row.gmail_message_id,
      kind: row.kind,
      snoozeLabelId: row.snooze_label_id ?? undefined,
    }),
  );
}

export async function finishReminder(id: string, error?: string) {
  await databaseQuery(
    `UPDATE email_organizer_reminders
     SET status = $2, updated_at = NOW() WHERE id = $1`,
    [id, error ? "failed" : "completed"],
  );
}

export async function saveGmailWatch(
  email: string,
  historyId: string,
  expiration: Date,
) {
  await databaseQuery(
    `UPDATE email_organizer_accounts
     SET history_id = $2, watch_expiration = $3, last_synced_at = NOW(), updated_at = NOW()
     WHERE email = $1`,
    [normalizeEmail(email), historyId, expiration],
  );
}

export async function getGmailHistoryId(email: string) {
  const result = await databaseQuery<{ history_id: string | null }>(
    `SELECT history_id FROM email_organizer_accounts WHERE email = $1`,
    [normalizeEmail(email)],
  );
  return result.rows[0]?.history_id ?? null;
}

export async function updateGmailHistoryId(email: string, historyId: string) {
  await databaseQuery(
    `UPDATE email_organizer_accounts
     SET history_id = $2, last_synced_at = NOW(), updated_at = NOW()
     WHERE email = $1`,
    [normalizeEmail(email), historyId],
  );
}

export async function listAccountsNeedingWatchRenewal() {
  const result = await databaseQuery<{ email: string }>(
    `SELECT email FROM email_organizer_accounts
     WHERE watch_expiration IS NULL OR watch_expiration < NOW() + INTERVAL '24 hours'
     ORDER BY watch_expiration NULLS FIRST LIMIT 20`,
  );
  return result.rows.map((row) => row.email);
}

export async function listPushSubscriptions(email: string) {
  const result = await databaseQuery<{
    endpoint: string;
    p256dh: string;
    auth: string;
  }>(
    `SELECT endpoint, p256dh, auth FROM email_organizer_push_subscriptions
     WHERE email = $1`,
    [normalizeEmail(email)],
  );
  return result.rows.map((row) => ({
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
  }));
}

export async function removePushSubscriptionByEndpoint(endpoint: string) {
  await databaseQuery(
    `DELETE FROM email_organizer_push_subscriptions WHERE endpoint = $1`,
    [endpoint],
  );
}

export async function listNotifications(email: string) {
  const result = await databaseQuery<{
    id: string;
    gmail_message_id: string | null;
    title: string;
    body: string;
    created_at: Date;
    read_at: Date | null;
  }>(
    `SELECT id, gmail_message_id, title, body, created_at, read_at
     FROM email_organizer_notifications WHERE email = $1
     ORDER BY created_at DESC LIMIT 25`,
    [normalizeEmail(email)],
  );
  return result.rows.map((row) => ({
    id: row.id,
    gmailMessageId: row.gmail_message_id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at.toISOString(),
    read: Boolean(row.read_at),
  }));
}

export async function markNotificationsRead(email: string) {
  await databaseQuery(
    `UPDATE email_organizer_notifications SET read_at = NOW()
     WHERE email = $1 AND read_at IS NULL`,
    [normalizeEmail(email)],
  );
}
