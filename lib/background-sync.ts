import "server-only";

import { triageGmailMessages } from "@/lib/ai-triage";
import {
  GmailApiError,
  getGmailMessage,
  listGmailHistory,
  modifyGmailMessage,
  sendGmailDraft,
  watchGmailInbox,
} from "@/lib/gmail";
import {
  claimDueReminders,
  claimDueScheduledMessages,
  finishReminder,
  finishScheduledMessage,
  getGmailHistoryId,
  getMailSettings,
  getStoredGoogleAccessToken,
  listAccountsNeedingWatchRenewal,
  listEnabledMailRules,
  saveGmailWatch,
  updateGmailHistoryId,
} from "@/lib/mail-store";
import { notifyImportantEmail } from "@/lib/web-push";

export async function startGmailWatch(email: string, accessToken?: string) {
  const topic = process.env.GMAIL_PUBSUB_TOPIC?.trim();
  if (!topic) throw new Error("GMAIL_PUBSUB_TOPIC n'est pas configuré.");
  const token = accessToken ?? (await getStoredGoogleAccessToken(email));
  const watch = await watchGmailInbox(token, topic);
  await saveGmailWatch(email, watch.historyId, watch.expiration);
  return watch;
}

export async function processGmailHistory(email: string, announcedHistoryId: string) {
  const accessToken = await getStoredGoogleAccessToken(email);
  const startHistoryId = await getGmailHistoryId(email);
  if (!startHistoryId) {
    await updateGmailHistoryId(email, announcedHistoryId);
    return { processed: 0 };
  }

  let history;
  try {
    history = await listGmailHistory(accessToken, startHistoryId);
  } catch (error) {
    if (error instanceof GmailApiError && error.status === 404) {
      await updateGmailHistoryId(email, announcedHistoryId);
      return { processed: 0 };
    }
    throw error;
  }
  const [rules, settings] = await Promise.all([
    listEnabledMailRules(email),
    getMailSettings(email),
  ]);
  let processed = 0;
  const triageIds: string[] = [];
  for (const item of history.messages) {
    const message = await getGmailMessage(accessToken, item.id);
    if (!message.labelIds.includes("INBOX")) continue;

    const sender = message.senderEmail.toLocaleLowerCase("fr-FR");
    const subject = message.subject.toLocaleLowerCase("fr-FR");
    const matchingLabels = new Set(
      rules
        .filter((rule) => {
          const senderMatches =
            !rule.senderContains ||
            sender.includes(rule.senderContains.toLocaleLowerCase("fr-FR"));
          const subjectMatches =
            !rule.subjectContains ||
            subject.includes(rule.subjectContains.toLocaleLowerCase("fr-FR"));
          return senderMatches && subjectMatches;
        })
        .map((rule) => rule.labelId),
    );
    for (const labelId of matchingLabels) {
      await modifyGmailMessage(accessToken, message.id, "add_label", labelId);
    }

    if (settings.preferences.notificationsEnabled && message.isImportant) {
      await notifyImportantEmail({
        email,
        gmailMessageId: message.id,
        title: `Email important de ${message.senderName}`,
        body: message.subject || message.snippet || "Nouveau message important",
      });
    }
    if (settings.preferences.autoTriage) triageIds.push(message.id);
    processed += 1;
  }
  for (let index = 0; index < triageIds.length; index += 10) {
    try {
      await triageGmailMessages(accessToken, triageIds.slice(index, index + 10));
    } catch (error) {
      console.error("Classement xKiro en arrière-plan interrompu.", error);
    }
  }
  await updateGmailHistoryId(email, history.historyId || announcedHistoryId);
  return { processed };
}

export async function processPriorityZeroJobs() {
  const result = { sent: 0, reminders: 0, watches: 0, errors: 0 };
  const scheduled = await claimDueScheduledMessages();
  for (const item of scheduled) {
    try {
      const accessToken = await getStoredGoogleAccessToken(item.email);
      await sendGmailDraft(accessToken, item.gmailDraftId);
      await finishScheduledMessage(item.id);
      result.sent += 1;
    } catch (error) {
      await finishScheduledMessage(
        item.id,
        error instanceof Error ? error.message : "Envoi programmé impossible.",
      );
      result.errors += 1;
    }
  }

  const reminders = await claimDueReminders();
  for (const reminder of reminders) {
    try {
      if (reminder.kind === "snooze") {
        const accessToken = await getStoredGoogleAccessToken(reminder.email);
        await modifyGmailMessage(accessToken, reminder.gmailMessageId, "add_label", "INBOX");
        if (reminder.snoozeLabelId) {
          await modifyGmailMessage(
            accessToken,
            reminder.gmailMessageId,
            "remove_label",
            reminder.snoozeLabelId,
          );
        }
      }
      await notifyImportantEmail({
        email: reminder.email,
        gmailMessageId: reminder.gmailMessageId,
        title: reminder.kind === "snooze" ? "Email de retour" : "Rappel email",
        body: "Ce message demande maintenant votre attention.",
      });
      await finishReminder(reminder.id);
      result.reminders += 1;
    } catch (error) {
      await finishReminder(
        reminder.id,
        error instanceof Error ? error.message : "Rappel impossible.",
      );
      result.errors += 1;
    }
  }

  if (process.env.GMAIL_PUBSUB_TOPIC?.trim()) {
    const accounts = await listAccountsNeedingWatchRenewal();
    for (const email of accounts) {
      try {
        await startGmailWatch(email);
        result.watches += 1;
      } catch (error) {
        console.error("Renouvellement Gmail watch impossible.", error);
        result.errors += 1;
      }
    }
  }
  return result;
}
