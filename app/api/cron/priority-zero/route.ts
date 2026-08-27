import { NextResponse, type NextRequest } from "next/server";

import { processPriorityZeroJobs } from "@/lib/background-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false }, { status: 401 });
  }
  try {
    return NextResponse.json({ success: true, data: await processPriorityZeroJobs() });
  } catch (error) {
    console.error("Traitements planifiés interrompus.", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
