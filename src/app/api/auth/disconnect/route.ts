import { NextResponse } from "next/server";

import { getEnv } from "@/lib/env";
import { clearTokens } from "@/lib/token-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await clearTokens();
  return NextResponse.json({ ok: true, connected: false });
}

export async function GET() {
  await clearTokens();
  const env = getEnv();
  return NextResponse.redirect(new URL("/?disconnected=1", env.appBaseUrl));
}
