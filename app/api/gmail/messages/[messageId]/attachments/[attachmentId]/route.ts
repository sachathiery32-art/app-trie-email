import { NextResponse, type NextRequest } from "next/server";

import { downloadGmailAttachment } from "@/lib/gmail";
import { gmailErrorResponse } from "@/lib/gmail-route";
import { getGoogleAccessToken } from "@/lib/google-session";

export const dynamic = "force-dynamic";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,512}$/;

type RouteContext = {
  params: Promise<{ messageId: string; attachmentId: string }>;
};

function safeDownloadName(value: string) {
  return (
    value
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/[\\/"]/g, "_")
      .trim()
      .slice(0, 180) || "piece-jointe"
  );
}

/** Transmet une pièce jointe Gmail sans exposer le jeton OAuth au navigateur. */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { messageId, attachmentId } = await context.params;
    if (!ID_PATTERN.test(messageId) || !ID_PATTERN.test(attachmentId)) {
      return NextResponse.json(
        {
          success: false,
          code: "VALIDATION_ERROR",
          error: "La pièce jointe demandée est invalide.",
        },
        { status: 400 },
      );
    }

    const accessToken = await getGoogleAccessToken(request);
    const attachment = await downloadGmailAttachment(
      accessToken,
      messageId,
      attachmentId,
    );
    const filename = safeDownloadName(
      request.nextUrl.searchParams.get("filename") ?? "piece-jointe",
    );
    const encodedFilename = encodeURIComponent(filename).replace(
      /[!'()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );

    return new NextResponse(new Uint8Array(attachment), {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="piece-jointe"; filename*=UTF-8''${encodedFilename}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return gmailErrorResponse(error);
  }
}
