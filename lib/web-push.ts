import "server-only";

import webPush from "web-push";

import {
  createNotification,
  listPushSubscriptions,
  removePushSubscriptionByEndpoint,
} from "@/lib/mail-store";

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return false;
  webPush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export async function notifyImportantEmail(input: {
  email: string;
  gmailMessageId?: string;
  title: string;
  body: string;
}) {
  await createNotification(input);
  if (!configureWebPush()) return;

  const subscriptions = await listPushSubscriptions(input.email);
  const payload = JSON.stringify({
    title: input.title,
    body: input.body,
    url: "/",
    messageId: input.gmailMessageId,
  });
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webPush.sendNotification(subscription, payload, { TTL: 300 });
      } catch (error) {
        const statusCode =
          typeof error === "object" && error && "statusCode" in error
            ? Number(error.statusCode)
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          await removePushSubscriptionByEndpoint(subscription.endpoint);
          return;
        }
        console.error("Notification Web Push non remise.", error);
      }
    }),
  );
}
