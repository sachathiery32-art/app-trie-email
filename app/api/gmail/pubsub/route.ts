import { NextResponse, type NextRequest } from "next/server";

import { processGmailHistory } from "@/lib/background-sync";

export const dynamic = "force-dynamic";

type PubSubEnvelope = {
  message?: { data?: string; messageId?: string };
};

export async function POST(request: NextRequest) {
  const expectedToken = process.env.GMAIL_PUBSUB_VERIFICATION_TOKEN?.trim();
  const providedToken =
    request.nextUrl.searchParams.get("token") ??
    request.headers.get("x-goog-pubsub-token");
  if (!expectedToken || providedToken !== expectedToken) {
    return NextResponse.json({ success: false }, { status: 401 });
  }
  try {
    const envelope = (await request.json()) as PubSubEnvelope;
    const encoded = envelope.message?.data;
    if (!encoded || encoded.length > 10_000) throw new Error("Notification Pub/Sub invalide.");
    const payload = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as {
      emailAddress?: unknown;
      historyId?: unknown;
    };
    const email = typeof payload.emailAddress === "string"
      ? payload.emailAddress.trim().toLocaleLowerCase("en-US")
      : "";
    const historyId = typeof payload.historyId === "string" ? payload.historyId : "";
    if (
      !email ||
      email.length > 320 ||
      !email.includes("@") ||
      !/^\d{1,30}$/.test(historyId)
    ) {
      return NextResponse.json({ success: false }, { status: 400 });
    }
    const allowedEmail = process.env.ALLOWED_GOOGLE_EMAIL
      ?.trim()
      .toLocaleLowerCase("en-US");
    if (!allowedEmail || email !== allowedEmail) {
      return NextResponse.json({ success: false }, { status: 403 });
    }
    const result = await processGmailHistory(email, historyId);
    return new NextResponse(null, { status: result.processed >= 0 ? 204 : 500 });
  } catch (error) {
    console.error("Notification Gmail Pub/Sub non traitée.", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
