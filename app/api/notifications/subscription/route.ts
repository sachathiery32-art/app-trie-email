import { NextResponse, type NextRequest } from "next/server";

import { deletePushSubscription, savePushSubscription } from "@/lib/mail-store";
import { requireGoogleUser } from "@/lib/google-session";

export const dynamic = "force-dynamic";

function validSubscription(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const keys = item.keys as Record<string, unknown> | undefined;
  if (
    typeof item.endpoint !== "string" || !item.endpoint.startsWith("https://") || item.endpoint.length > 2_000 ||
    !keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string" ||
    keys.p256dh.length > 500 || keys.auth.length > 500
  ) return null;
  return { endpoint: item.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

export async function POST(request: NextRequest) {
  try {
    const email = await requireGoogleUser(request);
    const subscription = validSubscription(await request.json().catch(() => null));
    if (!subscription) return NextResponse.json({ success: false, error: "Abonnement push invalide." }, { status: 400 });
    await savePushSubscription(email, subscription);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Les notifications push ne peuvent pas être activées." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const email = await requireGoogleUser(request);
    const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
    if (typeof body?.endpoint !== "string") return NextResponse.json({ success: false, error: "Abonnement push invalide." }, { status: 400 });
    await deletePushSubscription(email, body.endpoint);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Les notifications push ne peuvent pas être désactivées." }, { status: 500 });
  }
}
