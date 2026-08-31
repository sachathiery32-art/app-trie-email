import { NextResponse, type NextRequest } from "next/server";

import { finishScheduledMessage, cancelScheduledMessage, claimScheduledMessage } from "@/lib/mail-store";
import { sendGmailDraft } from "@/lib/gmail";
import { getGoogleAccessToken, requireGoogleUser } from "@/lib/google-session";

export const dynamic = "force-dynamic";
const ID_PATTERN = /^[0-9a-f-]{36}$/i;
type Context = { params: Promise<{ scheduleId: string }> };

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const { scheduleId } = await context.params;
    if (!ID_PATTERN.test(scheduleId)) return NextResponse.json({ success: false, error: "Envoi invalide." }, { status: 400 });
    const email = await requireGoogleUser(request);
    const cancelled = await cancelScheduledMessage(email, scheduleId);
    if (!cancelled) return NextResponse.json({ success: false, error: "Cet envoi est déjà parti ou annulé." }, { status: 409 });
    return NextResponse.json({ success: true, data: { gmailDraftId: cancelled.gmail_draft_id } });
  } catch {
    return NextResponse.json({ success: false, error: "L’envoi ne peut pas être annulé." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: Context) {
  const { scheduleId } = await context.params;
  if (!ID_PATTERN.test(scheduleId)) return NextResponse.json({ success: false, error: "Envoi invalide." }, { status: 400 });
  let claimed = false;
  try {
    const email = await requireGoogleUser(request);
    const scheduled = await claimScheduledMessage(email, scheduleId);
    if (!scheduled) return NextResponse.json({ success: true, data: { status: "pending" } });
    claimed = true;
    const accessToken = await getGoogleAccessToken(request);
    const sent = await sendGmailDraft(accessToken, scheduled.gmailDraftId);
    await finishScheduledMessage(scheduleId);
    return NextResponse.json({ success: true, data: { status: "sent", ...sent } });
  } catch (error) {
    if (claimed) {
      await finishScheduledMessage(scheduleId, error instanceof Error ? error.message : "Envoi impossible.").catch(() => undefined);
    }
    return NextResponse.json({ success: false, error: "Gmail n’a pas pu terminer l’envoi." }, { status: 500 });
  }
}
