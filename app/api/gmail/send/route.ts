import { NextResponse, type NextRequest } from "next/server";

import { sendGmailMessage } from "@/lib/gmail";
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
const EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

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
  if (
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

  if (
    to.length === 0 ||
    allRecipients.length > MAX_RECIPIENTS ||
    allRecipients.some((recipient) => !EMAIL_PATTERN.test(recipient)) ||
    !body.subject.trim() ||
    !body.body.trim()
  ) {
    return null;
  }

  return {
    to: to.join(", "),
    cc: cc.join(", "),
    bcc: bcc.join(", "),
    subject: body.subject.trim(),
    body: body.body.trim(),
  };
}

/** Valide puis envoie un message réel depuis le compte Gmail connecté. */
export async function POST(request: NextRequest) {
  try {
    const accessToken = await getGoogleAccessToken(request);
    const requestBody: unknown = await request.json().catch(() => null);
    const message = validateSendRequest(requestBody);

    if (!message) {
      return json(
        {
          success: false,
          code: "VALIDATION_ERROR",
          error:
            "Vérifiez les destinataires, l'objet et le contenu du message.",
        },
        400,
      );
    }

    const sentMessage = await sendGmailMessage(accessToken, message);
    return json({ success: true, data: sentMessage }, 200);
  } catch (error) {
    return gmailErrorResponse(error, "send");
  }
}
