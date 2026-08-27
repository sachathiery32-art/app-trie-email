import { NextResponse, type NextRequest } from "next/server";

import { DatabaseUnavailableError } from "@/lib/database";
import {
  createMailRule,
  createMailTemplate,
  deleteMailRule,
  deleteMailTemplate,
  getMailSettings,
  saveMailPreferences,
} from "@/lib/mail-store";
import { requireAllowedGoogleUser } from "@/lib/google-session";
import type { MailPreferences, MailSettingsResponse } from "@/types/settings";

export const dynamic = "force-dynamic";

function json(payload: MailSettingsResponse, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function settingsError(error: unknown) {
  if (error instanceof DatabaseUnavailableError) {
    return json({ success: false, error: error.message }, 503);
  }
  console.error("Échec des préférences serveur.", error);
  return json({ success: false, error: "Les préférences ne peuvent pas être enregistrées." }, 500);
}

function validPreferences(value: unknown): MailPreferences | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (
    typeof item.autoTriage !== "boolean" ||
    typeof item.writingStyle !== "string" ||
    typeof item.signature !== "string" ||
    typeof item.undoSendSeconds !== "number" ||
    !Number.isInteger(item.undoSendSeconds) ||
    item.undoSendSeconds < 0 ||
    item.undoSendSeconds > 30 ||
    typeof item.notificationsEnabled !== "boolean" ||
    item.writingStyle.length > 500 ||
    item.signature.length > 5_000
  ) {
    return null;
  }
  return {
    autoTriage: item.autoTriage,
    writingStyle: item.writingStyle.trim(),
    signature: item.signature.trim(),
    undoSendSeconds: item.undoSendSeconds,
    notificationsEnabled: item.notificationsEnabled,
  };
}

export async function GET(request: NextRequest) {
  try {
    const email = await requireAllowedGoogleUser(request);
    return json({ success: true, data: await getMailSettings(email) });
  } catch (error) {
    return settingsError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const email = await requireAllowedGoogleUser(request);
    const preferences = validPreferences(await request.json().catch(() => null));
    if (!preferences) {
      return json({ success: false, error: "Les préférences sont invalides." }, 400);
    }
    await saveMailPreferences(email, preferences);
    return json({ success: true, data: await getMailSettings(email) });
  } catch (error) {
    return settingsError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const email = await requireAllowedGoogleUser(request);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || (body.kind !== "template" && body.kind !== "rule")) {
      return json({ success: false, error: "La création demandée est invalide." }, 400);
    }
    if (body.kind === "template") {
      if (
        typeof body.name !== "string" || !body.name.trim() || body.name.length > 80 ||
        typeof body.subject !== "string" || body.subject.length > 500 ||
        typeof body.body !== "string" || !body.body.trim() || body.body.length > 20_000
      ) {
        return json({ success: false, error: "Le modèle est invalide." }, 400);
      }
      await createMailTemplate(email, {
        name: body.name.trim(), subject: body.subject.trim(), body: body.body.trim(),
      });
    } else {
      if (
        typeof body.name !== "string" || !body.name.trim() || body.name.length > 80 ||
        typeof body.senderContains !== "string" || body.senderContains.length > 200 ||
        typeof body.subjectContains !== "string" || body.subjectContains.length > 200 ||
        (!body.senderContains.trim() && !body.subjectContains.trim()) ||
        typeof body.labelId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(body.labelId)
      ) {
        return json({ success: false, error: "La règle est invalide." }, 400);
      }
      await createMailRule(email, {
        name: body.name.trim(),
        senderContains: body.senderContains.trim(),
        subjectContains: body.subjectContains.trim(),
        labelId: body.labelId,
        enabled: true,
      });
    }
    return json({ success: true, data: await getMailSettings(email) });
  } catch (error) {
    return settingsError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const email = await requireAllowedGoogleUser(request);
    const kind = request.nextUrl.searchParams.get("kind");
    const id = request.nextUrl.searchParams.get("id") ?? "";
    if ((kind !== "template" && kind !== "rule") || !/^\d{1,20}$/.test(id)) {
      return json({ success: false, error: "La suppression demandée est invalide." }, 400);
    }
    if (kind === "template") await deleteMailTemplate(email, id);
    else await deleteMailRule(email, id);
    return json({ success: true, data: await getMailSettings(email) });
  } catch (error) {
    return settingsError(error);
  }
}
