import { NextResponse, type NextRequest } from "next/server";

import { listGmailMailboxPage } from "@/lib/gmail";
import { gmailErrorResponse } from "@/lib/gmail-route";
import { getGoogleAccessToken } from "@/lib/google-session";
import {
  GMAIL_MAILBOX_VIEWS,
  type GmailInboxResponse,
  type GmailMailboxView,
} from "@/types/gmail";

export const dynamic = "force-dynamic";

function json(payload: GmailInboxResponse, status: number) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

/** Retourne une page d'une vue Gmail et accepte la recherche Gmail. */
export async function GET(request: NextRequest) {
  try {
    const pageToken = request.nextUrl.searchParams.get("pageToken")?.trim();
    const requestedView =
      request.nextUrl.searchParams.get("view")?.trim() || "inbox";
    const search = request.nextUrl.searchParams.get("q")?.trim() || "";

    if (
      (pageToken && pageToken.length > 2048) ||
      search.length > 500 ||
      !GMAIL_MAILBOX_VIEWS.some((view) => view === requestedView)
    ) {
      return json(
        {
          success: false,
          code: "VALIDATION_ERROR",
          error: "La vue, la recherche ou la pagination Gmail est invalide.",
        },
        400,
      );
    }

    const accessToken = await getGoogleAccessToken(request);
    const inbox = await listGmailMailboxPage(accessToken, {
      view: requestedView as GmailMailboxView,
      pageToken: pageToken || undefined,
      search,
    });
    return json({ success: true, data: inbox }, 200);
  } catch (error) {
    return gmailErrorResponse(error);
  }
}
