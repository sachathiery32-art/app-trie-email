import "server-only";

import { Pool, type QueryResultRow } from "pg";

export class DatabaseUnavailableError extends Error {
  constructor() {
    super("PostgreSQL n'est pas configuré. Ajoutez DATABASE_URL.");
    this.name = "DatabaseUnavailableError";
  }
}

declare global {
  var emailOrganizerPool: Pool | undefined;
}

let schemaPromise: Promise<void> | undefined;

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function pool() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new DatabaseUnavailableError();

  if (!globalThis.emailOrganizerPool) {
    const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
    globalThis.emailOrganizerPool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 8_000,
      ssl:
        process.env.POSTGRES_SSL === "disable" || isLocal
          ? false
          : { rejectUnauthorized: false },
    });
  }
  return globalThis.emailOrganizerPool;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS email_organizer_accounts (
  email TEXT PRIMARY KEY,
  encrypted_refresh_token TEXT NOT NULL,
  history_id TEXT,
  watch_expiration TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS email_organizer_preferences (
  email TEXT PRIMARY KEY,
  auto_triage BOOLEAN NOT NULL DEFAULT TRUE,
  writing_style TEXT NOT NULL DEFAULT '',
  signature TEXT NOT NULL DEFAULT '',
  undo_send_seconds INTEGER NOT NULL DEFAULT 10 CHECK (undo_send_seconds BETWEEN 0 AND 30),
  notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS email_organizer_templates (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS email_organizer_templates_email_idx
  ON email_organizer_templates(email);
CREATE TABLE IF NOT EXISTS email_organizer_rules (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  sender_contains TEXT NOT NULL DEFAULT '',
  subject_contains TEXT NOT NULL DEFAULT '',
  label_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS email_organizer_rules_email_idx
  ON email_organizer_rules(email);
CREATE TABLE IF NOT EXISTS email_organizer_scheduled_messages (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  gmail_draft_id TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS email_organizer_scheduled_due_idx
  ON email_organizer_scheduled_messages(status, scheduled_for);
CREATE TABLE IF NOT EXISTS email_organizer_reminders (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  gmail_message_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('snooze', 'reminder')),
  remind_at TIMESTAMPTZ NOT NULL,
  snooze_label_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS email_organizer_reminders_due_idx
  ON email_organizer_reminders(status, remind_at);
CREATE TABLE IF NOT EXISTS email_organizer_push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS email_organizer_push_email_idx
  ON email_organizer_push_subscriptions(email);
CREATE TABLE IF NOT EXISTS email_organizer_notifications (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  gmail_message_id TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS email_organizer_notifications_email_idx
  ON email_organizer_notifications(email, created_at DESC);
`;

export async function ensureDatabaseSchema() {
  if (!schemaPromise) {
    schemaPromise = pool()
      .query(SCHEMA)
      .then(() => undefined)
      .catch((error) => {
        schemaPromise = undefined;
        throw error;
      });
  }
  return schemaPromise;
}

export async function databaseQuery<T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  await ensureDatabaseSchema();
  return pool().query<T>(text, values);
}
