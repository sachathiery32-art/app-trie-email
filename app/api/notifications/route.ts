import { NextResponse, type NextRequest } from "next/server";

import { listNotifications, markNotificationsRead } from "@/lib/mail-store";
import { requireGoogleUser } from "@/lib/google-session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const email = await requireGoogleUser(request);
    return NextResponse.json(
      { success: true, data: await listNotifications(email) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ success: false, error: "Notifications indisponibles." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const email = await requireGoogleUser(request);
    await markNotificationsRead(email);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Notifications indisponibles." }, { status: 500 });
  }
}
