import { NextResponse, type NextRequest } from "next/server";

import { startGmailWatch } from "@/lib/background-sync";
import { getGoogleAccessToken, requireGoogleUser } from "@/lib/google-session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const [email, accessToken] = await Promise.all([
      requireGoogleUser(request),
      getGoogleAccessToken(request),
    ]);
    const watch = await startGmailWatch(email, accessToken);
    return NextResponse.json({
      success: true,
      data: { active: true, expiration: watch.expiration.toISOString() },
    });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("GMAIL_PUBSUB_TOPIC")
      ? "Ajoutez GMAIL_PUBSUB_TOPIC pour activer la synchronisation permanente."
      : "La synchronisation Gmail permanente n’a pas pu être activée.";
    return NextResponse.json({ success: false, error: message }, { status: 503 });
  }
}
