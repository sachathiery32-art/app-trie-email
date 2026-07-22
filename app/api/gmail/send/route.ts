import { NextResponse, type NextRequest } from "next/server";

import {
  sendGmailMessage,
  type GmailOutgoingAttachment,
} from "@/lib/gmail";
import { gmailErrorResponse } from "@/lib/gmail-route";
import { getGoogleAccessToken } from "@/lib/google-session";
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
    return {
      body: (await request.json().catch(() => null)) as unknown,
      files: [] as File[],
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
  };
}

/** Valide puis envoie un message réel depuis le compte Gmail connecté. */
export async function POST(request: NextRequest) {
  try {
    const accessToken = await getGoogleAccessToken(request);
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
      )
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
    const sentMessage = await sendGmailMessage(
      accessToken,
      message,
      attachments,
    );
    return json({ success: true, data: sentMessage }, 200);
  } catch (error) {
    return gmailErrorResponse(error, "send");
  }
}
