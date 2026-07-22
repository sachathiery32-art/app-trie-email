import { NextResponse, type NextRequest } from "next/server";

import { modifyGmailMessage } from "@/lib/gmail";
import { gmailErrorResponse } from "@/lib/gmail-route";
import { getGoogleAccessToken } from "@/lib/google-session";
import type {
  GmailModifyAction,
  GmailModifyRequest,
  GmailModifyResponse,
} from "@/types/gmail";

export const dynamic = "force-dynamic";

const ACTIONS: GmailModifyAction[] = [
  "mark_read",
  "mark_unread",
  "star",
  "unstar",
  "archive",
  "trash",
  "restore",
  "add_label",
  "remove_label",
];
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

type RouteContext = {
  params: Promise<{ messageId: string }>;
};

function json(payload: GmailModifyResponse, status: number) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function validateRequest(value: unknown): GmailModifyRequest | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const body = value as Record<string, unknown>;
  const action = ACTIONS.find((candidate) => candidate === body.action);
  const labelId = typeof body.labelId === "string" ? body.labelId.trim() : undefined;

  if (
    !action ||
    ((action === "add_label" || action === "remove_label") &&
      (!labelId || !ID_PATTERN.test(labelId)))
  ) {
    return null;
  }

  return { action, labelId };
}

/** Modifie un message Gmail uniquement après validation de la session et de l'action. */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { messageId } = await context.params;
    const body = validateRequest(await request.json().catch(() => null));

    if (!ID_PATTERN.test(messageId) || !body) {
      return json(
        {
          success: false,
          code: "VALIDATION_ERROR",
          error: "L'action Gmail demandée est invalide.",
        },
        400,
      );
    }

    const accessToken = await getGoogleAccessToken(request);
    await modifyGmailMessage(
      accessToken,
      messageId,
      body.action,
      body.labelId,
    );
    return json({ success: true }, 200);
  } catch (error) {
    return gmailErrorResponse(error, "modify");
  }
}
