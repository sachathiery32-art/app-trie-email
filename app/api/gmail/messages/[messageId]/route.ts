import { NextResponse, type NextRequest } from "next/server";

import { getGmailMessage } from "@/lib/gmail";
import { gmailErrorResponse } from "@/lib/gmail-route";
import { getGoogleAccessToken } from "@/lib/google-session";
import type { GmailMessageResponse } from "@/types/gmail";

export const dynamic = "force-dynamic";

type MessageRouteContext = {
  params: Promise<{ messageId: string }>;
};

function json(payload: GmailMessageResponse, status: number) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

/** Retourne le contenu complet d'un message appartenant au compte connecté. */
export async function GET(
  request: NextRequest,
  context: MessageRouteContext,
) {
  try {
    const { messageId } = await context.params;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(messageId)) {
      return json(
        {
          success: false,
          code: "GMAIL_ERROR",
          error: "L'identifiant du message est invalide.",
        },
        400,
      );
    }

    const accessToken = await getGoogleAccessToken(request);
    const message = await getGmailMessage(accessToken, messageId);
    return json({ success: true, data: message }, 200);
  } catch (error) {
    return gmailErrorResponse(error);
  }
}
