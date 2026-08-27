import { NextResponse, type NextRequest } from "next/server";

import { findGmailDraftId, saveGmailDraft, type GmailOutgoingAttachment } from "@/lib/gmail";
import { gmailErrorResponse } from "@/lib/gmail-route";
import { getGoogleAccessToken } from "@/lib/google-session";
import type { GmailDraftResponse, GmailSendRequest } from "@/types/gmail";

export const dynamic = "force-dynamic";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const MODES = ["compose", "reply", "replyAll", "forward"] as const;

function json(payload: GmailDraftResponse, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
}

function value(form: FormData, name: string) {
  const result = form.get(name);
  return typeof result === "string" ? result : "";
}

function validRecipients(input: string) {
  return input.split(/[;,]/).map((item) => item.trim()).filter(Boolean).every((item) => EMAIL_PATTERN.test(item));
}

export async function GET(request: NextRequest) {
  try {
    const messageId = request.nextUrl.searchParams.get("messageId")?.trim() ?? "";
    if (!ID_PATTERN.test(messageId)) return json({ success: false, code: "VALIDATION_ERROR", error: "Brouillon invalide." }, 400);
    const accessToken = await getGoogleAccessToken(request);
    const draftId = await findGmailDraftId(accessToken, messageId);
    if (!draftId) return json({ success: false, code: "GMAIL_ERROR", error: "Ce brouillon Gmail est introuvable." }, 404);
    return json({ success: true, data: { draftId, messageId, threadId: messageId } });
  } catch (error) {
    return gmailErrorResponse(error, "modify");
  }
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const mode = MODES.find((item) => item === value(form, "mode"));
    const draftId = value(form, "draftId").trim();
    const sourceMessageId = value(form, "sourceMessageId").trim();
    const message: GmailSendRequest | null = mode
      ? {
          mode,
          ...(sourceMessageId ? { sourceMessageId } : {}),
          to: value(form, "to").trim(),
          cc: value(form, "cc").trim(),
          bcc: value(form, "bcc").trim(),
          subject: value(form, "subject").trim(),
          body: value(form, "body"),
        }
      : null;
    const files = form.getAll("attachments").filter((item): item is File => item instanceof File);
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (
      !message ||
      (draftId && !ID_PATTERN.test(draftId)) ||
      (sourceMessageId && !ID_PATTERN.test(sourceMessageId)) ||
      !validRecipients(message.to) || !validRecipients(message.cc) || !validRecipients(message.bcc) ||
      message.to.length > 2_000 || message.cc.length > 2_000 || message.bcc.length > 2_000 ||
      message.subject.length > 500 || message.body.length > 20_000 ||
      files.length > 10 || totalBytes > 3 * 1024 * 1024 || files.some((file) => !file.size || file.name.length > 180)
    ) {
      return json({ success: false, code: "VALIDATION_ERROR", error: "Le brouillon contient des données invalides." }, 400);
    }
    const attachments: GmailOutgoingAttachment[] = await Promise.all(
      files.map(async (file) => ({
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        data: Buffer.from(await file.arrayBuffer()),
      })),
    );
    const accessToken = await getGoogleAccessToken(request);
    const draft = await saveGmailDraft(accessToken, message, attachments, draftId || undefined);
    return json({ success: true, data: draft });
  } catch (error) {
    return gmailErrorResponse(error, "modify");
  }
}
