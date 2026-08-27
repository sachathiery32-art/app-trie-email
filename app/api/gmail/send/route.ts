import { NextResponse, type NextRequest } from "next/server";

import {
  saveGmailDraft,
  sendGmailDraft,
  sendGmailMessage,
  type GmailOutgoingAttachment,
} from "@/lib/gmail";
import { gmailErrorResponse } from "@/lib/gmail-route";
import { getGoogleAccessToken } from "@/lib/google-session";
import { requireAllowedGoogleUser } from "@/lib/google-session";
import { getMailSettings, scheduleGmailDraft } from "@/lib/mail-store";
import type {
  GmailSendRequest,
  GmailSendResponse,
} from "@/types/gmail";

export const dynamic = "force-dynamic";

const MAX_RECIPIENT_FIELD_LENGTH = 2_000;
const MAX_RECIPIENTS = 50;
const MAX_SUBJECT_LENGTH = 500;
const MAX_BODY_LENGTH = 20_000;
const MAX_ATTACHMENTS = 10;
// Vercel limite la taille des requêtes : 3 Mo laisse une marge au multipart.
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const MESSAGE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const SEND_MODES = ["compose", "reply", "replyAll", "forward"] as const;

function json(payload: GmailSendResponse, status: number) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function recipients(value: string) {
  return value
    .split(/[;,]/)
    .map((recipient) => recipient.trim())
    .filter(Boolean);
}

function validateSendRequest(value: unknown): GmailSendRequest | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const body = value as Record<string, unknown>;
  const mode = SEND_MODES.find((candidate) => candidate === body.mode);
  if (
    !mode ||
    typeof body.to !== "string" ||
    typeof body.cc !== "string" ||
    typeof body.bcc !== "string" ||
    typeof body.subject !== "string" ||
    typeof body.body !== "string"
  ) {
    return null;
  }

  if (
    body.to.length > MAX_RECIPIENT_FIELD_LENGTH ||
    body.cc.length > MAX_RECIPIENT_FIELD_LENGTH ||
    body.bcc.length > MAX_RECIPIENT_FIELD_LENGTH ||
    body.subject.length > MAX_SUBJECT_LENGTH ||
    body.body.length > MAX_BODY_LENGTH
  ) {
    return null;
  }

  const to = recipients(body.to);
  const cc = recipients(body.cc);
  const bcc = recipients(body.bcc);
  const allRecipients = [...to, ...cc, ...bcc];
  const isReply = mode === "reply" || mode === "replyAll";
  const sourceMessageId =
    typeof body.sourceMessageId === "string"
      ? body.sourceMessageId.trim()
      : undefined;

  if (
    to.length === 0 ||
    allRecipients.length > MAX_RECIPIENTS ||
    allRecipients.some((recipient) => !EMAIL_PATTERN.test(recipient)) ||
    !body.subject.trim() ||
    !body.body.trim() ||
    (isReply &&
      (!sourceMessageId || !MESSAGE_ID_PATTERN.test(sourceMessageId))) ||
    (sourceMessageId && !MESSAGE_ID_PATTERN.test(sourceMessageId))
  ) {
    return null;
  }

  return {
    mode,
    sourceMessageId,
    to: to.join(", "),
    cc: cc.join(", "),
    bcc: bcc.join(", "),
    subject: body.subject.trim(),
    body: body.body.trim(),
  };
}

function formText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function parseSendRequest(request: NextRequest) {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    return {
      body: body as unknown,
      files: [] as File[],
      draftId: typeof body?.draftId === "string" ? body.draftId.trim() : "",
      scheduledFor: typeof body?.scheduledFor === "string" ? body.scheduledFor.trim() : "",
    };
  }

  const formData = await request.formData();
  return {
    body: {
      mode: formText(formData, "mode"),
      sourceMessageId: formText(formData, "sourceMessageId"),
      to: formText(formData, "to"),
      cc: formText(formData, "cc"),
      bcc: formText(formData, "bcc"),
      subject: formText(formData, "subject"),
      body: formText(formData, "body"),
    },
    files: formData
      .getAll("attachments")
      .filter((value): value is File => value instanceof File),
    draftId: formText(formData, "draftId").trim(),
    scheduledFor: formText(formData, "scheduledFor").trim(),
  };
}

/** Valide puis envoie un message réel depuis le compte Gmail connecté. */
export async function POST(request: NextRequest) {
  try {
    const [accessToken, accountEmail] = await Promise.all([
      getGoogleAccessToken(request),
      requireAllowedGoogleUser(request),
    ]);
    const parsedRequest = await parseSendRequest(request);
    const message = validateSendRequest(parsedRequest.body);
    const totalAttachmentBytes = parsedRequest.files.reduce(
      (total, file) => total + file.size,
      0,
    );

    if (
      !message ||
      parsedRequest.files.length > MAX_ATTACHMENTS ||
      totalAttachmentBytes > MAX_ATTACHMENT_BYTES ||
      parsedRequest.files.some(
        (file) => file.name.length > 180 || file.size === 0,
      ) ||
      (parsedRequest.draftId && !MESSAGE_ID_PATTERN.test(parsedRequest.draftId))
    ) {
      return json(
        {
          success: false,
          code: "VALIDATION_ERROR",
          error:
            "Vérifiez les destinataires, le contenu et les pièces jointes (10 fichiers et 3 Mo maximum).",
        },
        400,
      );
    }

    const attachments: GmailOutgoingAttachment[] = await Promise.all(
      parsedRequest.files.map(async (file) => ({
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        data: Buffer.from(await file.arrayBuffer()),
      })),
    );

    const requestedDate = parsedRequest.scheduledFor
      ? new Date(parsedRequest.scheduledFor)
      : null;
    if (requestedDate && (!Number.isFinite(requestedDate.getTime()) || requestedDate.getTime() < Date.now() + 30_000)) {
      return json({ success: false, code: "VALIDATION_ERROR", error: "Choisissez une date d’envoi située dans le futur." }, 400);
    }
    let undoSeconds = 0;
    let databaseReady = false;
    try {
      const settings = await getMailSettings(accountEmail);
      databaseReady = settings.databaseReady;
      undoSeconds = databaseReady ? settings.preferences.undoSendSeconds : 0;
    } catch {
      undoSeconds = 0;
    }
    if (requestedDate && !databaseReady) {
      return json(
        {
          success: false,
          code: "CONFIGURATION_ERROR",
          error:
            "La programmation d’envoi nécessite PostgreSQL. Configurez DATABASE_URL puis réessayez.",
        },
        503,
      );
    }
    const scheduledFor = requestedDate ?? (undoSeconds > 0 ? new Date(Date.now() + undoSeconds * 1_000) : null);
    if (scheduledFor) {
      const draft = await saveGmailDraft(
        accessToken,
        message,
        attachments,
        parsedRequest.draftId || undefined,
      );
      const scheduleId = await scheduleGmailDraft(accountEmail, draft.draftId, scheduledFor);
      return json({
        success: true,
        data: {
          status: "scheduled",
          scheduleId,
          gmailDraftId: draft.draftId,
          scheduledFor: scheduledFor.toISOString(),
          ...(!requestedDate ? { undoUntil: scheduledFor.toISOString() } : {}),
        },
      }, 200);
    }

    if (parsedRequest.draftId) {
      const draft = await saveGmailDraft(accessToken, message, attachments, parsedRequest.draftId);
      const sent = await sendGmailDraft(accessToken, draft.draftId);
      return json({ success: true, data: { status: "sent", ...sent } }, 200);
    }
    const sentMessage = await sendGmailMessage(
      accessToken,
      message,
      attachments,
    );
    return json({ success: true, data: { status: "sent", ...sentMessage } }, 200);
  } catch (error) {
    return gmailErrorResponse(error, "send");
  }
}
