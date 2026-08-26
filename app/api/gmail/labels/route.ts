import { NextResponse, type NextRequest } from "next/server";

import { ensureGmailLabels, listGmailLabels } from "@/lib/gmail";
import { gmailErrorResponse } from "@/lib/gmail-route";
import { getGoogleAccessToken } from "@/lib/google-session";
import type { GmailLabelCreateResponse } from "@/types/gmail";

export const dynamic = "force-dynamic";

const FOLDER_ROOT = "Dossiers/";
const SAFE_NAME = /^[^/\\"\u0000-\u001f\u007f]{1,50}$/;

function json(payload: GmailLabelCreateResponse, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

/** Crée un dossier personnel ou un sous-dossier de premier niveau dans Gmail. */
export async function POST(request: NextRequest) {
  const value: unknown = await request.json().catch(() => null);
  if (typeof value !== "object" || value === null) {
    return json(
      { success: false, code: "VALIDATION_ERROR", error: "Le dossier est invalide." },
      400,
    );
  }

  const body = value as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const parent = typeof body.parent === "string" ? body.parent.trim() : "";
  if (!SAFE_NAME.test(name) || (parent && !/^Dossiers\/[^/]{1,50}$/.test(parent))) {
    return json(
      {
        success: false,
        code: "VALIDATION_ERROR",
        error: "Utilisez un nom de 1 à 50 caractères, sans barre oblique ni guillemet.",
      },
      400,
    );
  }

  try {
    const accessToken = await getGoogleAccessToken(request);
    if (parent) {
      const labels = await listGmailLabels(accessToken);
      if (!labels.some((label) => label.type === "user" && label.name === parent)) {
        return json(
          {
            success: false,
            code: "VALIDATION_ERROR",
            error: "Le dossier parent n’existe plus.",
          },
          400,
        );
      }
    }

    const fullName = parent ? `${parent}/${name}` : `${FOLDER_ROOT}${name}`;
    const [label] = await ensureGmailLabels(accessToken, [fullName]);
    return json({ success: true, data: { label } });
  } catch (error) {
    return gmailErrorResponse(error, "modify");
  }
}
