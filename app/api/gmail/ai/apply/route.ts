import { NextResponse, type NextRequest } from "next/server";

import { applyAiLabels } from "@/lib/ai-labels";
import { aiSessionError } from "@/lib/ai-session";
import { gmailErrorResponse } from "@/lib/gmail-route";
import { getGoogleAccessToken } from "@/lib/google-session";
import {
  AI_EMAIL_CATEGORIES,
  AI_EMAIL_PRIORITIES,
  type GmailAiApplyResponse,
} from "@/types/ai";

export const dynamic = "force-dynamic";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function json(payload: GmailAiApplyResponse, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: NextRequest) {
  const sessionError = await aiSessionError(request);
  if (sessionError) return sessionError;

  const value: unknown = await request.json().catch(() => null);
  if (typeof value !== "object" || value === null) {
    return json({ success: false, error: "La classification est invalide." }, 400);
  }
  const body = value as Record<string, unknown>;
  const category = AI_EMAIL_CATEGORIES.find((item) => item === body.category);
  const priority = AI_EMAIL_PRIORITIES.find((item) => item === body.priority);
  if (
    typeof body.messageId !== "string" ||
    !ID_PATTERN.test(body.messageId) ||
    !category ||
    !priority ||
    typeof body.requiresReply !== "boolean"
  ) {
    return json({ success: false, error: "La classification est invalide." }, 400);
  }

  try {
    const accessToken = await getGoogleAccessToken(request);
    const appliedLabels = await applyAiLabels(accessToken, {
      messageId: body.messageId,
      category,
      priority,
      requiresReply: body.requiresReply,
    });
    return json({ success: true, data: { appliedLabels } });
  } catch (error) {
    return gmailErrorResponse(error, "modify");
  }
}
