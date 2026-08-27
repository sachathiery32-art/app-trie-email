import { NextResponse, type NextRequest } from "next/server";

import { modifyGmailMessages } from "@/lib/gmail";
import { gmailErrorResponse } from "@/lib/gmail-route";
import { getGoogleAccessToken } from "@/lib/google-session";

export const dynamic = "force-dynamic";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const ACTIONS = ["mark_read", "mark_unread", "star", "unstar", "archive", "trash"] as const;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const action = ACTIONS.find((item) => item === body?.action);
    const messageIds = Array.isArray(body?.messageIds)
      ? [...new Set(body.messageIds.filter((id): id is string => typeof id === "string"))]
      : [];
    if (!action || !messageIds.length || messageIds.length > 100 || messageIds.some((id) => !ID_PATTERN.test(id))) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", error: "L’action groupée est invalide." }, { status: 400 });
    }
    const accessToken = await getGoogleAccessToken(request);
    await modifyGmailMessages(accessToken, messageIds, action);
    return NextResponse.json({ success: true, data: { modified: messageIds.length } });
  } catch (error) {
    return gmailErrorResponse(error, "modify");
  }
}
