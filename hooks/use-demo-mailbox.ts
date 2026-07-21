"use client";

import { useCallback, useEffect, useState } from "react";

import { DEMO_EMAILS } from "@/lib/demo-emails";
import { MAILBOX_FOLDERS, type OrganizerEmail } from "@/types/email";

const STORAGE_KEY = "email-organizer-demo-mailbox";
const STORAGE_VERSION = 1;

type StoredMailbox = {
  version: number;
  emails: OrganizerEmail[];
};

function cloneDemoEmails() {
  return DEMO_EMAILS.map((email) => ({
    ...email,
    recipients: [...email.recipients],
    cc: [...email.cc],
    bcc: [...email.bcc],
  }));
}

function isOrganizerEmail(value: unknown): value is OrganizerEmail {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const email = value as Record<string, unknown>;

  return (
    typeof email.id === "string" &&
    typeof email.sender === "string" &&
    typeof email.subject === "string" &&
    typeof email.body === "string" &&
    typeof email.timestamp === "number" &&
    typeof email.folder === "string" &&
    MAILBOX_FOLDERS.some((folder) => folder === email.folder) &&
    Array.isArray(email.recipients)
  );
}

function readStoredMailbox(): OrganizerEmail[] | null {
  try {
    const serializedMailbox = window.localStorage.getItem(STORAGE_KEY);

    if (!serializedMailbox) {
      return null;
    }

    const storedMailbox = JSON.parse(serializedMailbox) as StoredMailbox;

    if (
      storedMailbox.version !== STORAGE_VERSION ||
      !Array.isArray(storedMailbox.emails) ||
      !storedMailbox.emails.every(isOrganizerEmail)
    ) {
      return null;
    }

    return storedMailbox.emails;
  } catch {
    return null;
  }
}

/** Persiste la boîte fictive dans ce navigateur, sans serveur ni compte. */
export function useDemoMailbox() {
  const [emails, setEmails] = useState<OrganizerEmail[]>(cloneDemoEmails);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const storedEmails = readStoredMailbox();

      if (storedEmails) {
        setEmails(storedEmails);
      }

      setIsHydrated(true);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const mailbox: StoredMailbox = {
      version: STORAGE_VERSION,
      emails,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mailbox));
  }, [emails, isHydrated]);

  const resetMailbox = useCallback(() => {
    const initialEmails = cloneDemoEmails();
    setEmails(initialEmails);
    window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { emails, setEmails, resetMailbox, isHydrated };
}
