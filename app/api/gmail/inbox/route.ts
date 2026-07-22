import { NextResponse, type NextRequest } from "next/server";

import { listGmailInboxPage } from "@/lib/gmail";
import { gmailErrorResponse } from "@/lib/gmail-route";
import { getGoogleAccessToken } from "@/lib/google-session";
import type { GmailInboxResponse } from "@/types/gmail";

export const dynamic = "force-dynamic";

function json(payload: GmailInboxResponse, status: number) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

/** Retourne une page de 20 messages Gmail sans effectuer de modification. */
export async function GET(request: NextRequest) {
  try {
    const pageToken = request.nextUrl.searchParams.get("pageToken")?.trim();

    if (pageToken && pageToken.length > 2048) {
      return json(
        {
          success: false,
          code: "GMAIL_ERROR",
          error: "Le curseur de pagination Gmail est invalide.",
        },
        400,
      );
    }

    const accessToken = await getGoogleAccessToken(request);
    const inbox = await listGmailInboxPage(
      accessToken,
      pageToken || undefined,
    );
    return json({ success: true, data: inbox }, 200);
  } catch (error) {
    return gmailErrorResponse(error);
  }
}
