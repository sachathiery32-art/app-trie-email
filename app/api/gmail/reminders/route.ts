import { NextResponse, type NextRequest } from "next/server";

import { ensureGmailLabels, modifyGmailMessage } from "@/lib/gmail";
import { gmailErrorResponse } from "@/lib/gmail-route";
import { getGoogleAccessToken, requireGoogleUser } from "@/lib/google-session";
import { createReminder } from "@/lib/mail-store";

export const dynamic = "force-dynamic";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const kind = body?.kind === "snooze" || body?.kind === "reminder" ? body.kind : null;
    const messageIds = Array.isArray(body?.messageIds)
      ? [...new Set(body.messageIds.filter((item): item is string => typeof item === "string"))]
      : [];
    const remindAt = typeof body?.remindAt === "string" ? new Date(body.remindAt) : new Date(NaN);
    if (
      !kind || !messageIds.length || messageIds.length > 100 ||
      messageIds.some((id) => !ID_PATTERN.test(id)) ||
      !Number.isFinite(remindAt.getTime()) || remindAt.getTime() < Date.now() + 30_000 ||
      remindAt.getTime() > Date.now() + 366 * 24 * 60 * 60 * 1_000
    ) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", error: "Le rappel demandé est invalide." }, { status: 400 });
    }
    const [accessToken, email] = await Promise.all([
      getGoogleAccessToken(request),
      requireGoogleUser(request),
    ]);
    let snoozeLabelId: string | undefined;
    if (kind === "snooze") {
      const [label] = await ensureGmailLabels(accessToken, ["Email Organizer/Snoozed"]);
      snoozeLabelId = label.id;
    }
    for (const messageId of messageIds) {
      if (kind === "snooze") {
        await modifyGmailMessage(accessToken, messageId, "add_label", snoozeLabelId);
        await modifyGmailMessage(accessToken, messageId, "archive");
      }
      await createReminder({ email, messageId, kind, remindAt, snoozeLabelId });
    }
    return NextResponse.json({ success: true, data: { created: messageIds.length } });
  } catch (error) {
    return gmailErrorResponse(error, "modify");
  }
}
