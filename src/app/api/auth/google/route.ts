import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

import { getEnv, oauthConfigured } from "@/lib/env";
import { MOCK_EMAIL } from "@/lib/mock-data";
import { buildAuthUrl } from "@/lib/oauth";
import { saveTokens } from "@/lib/token-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const env = getEnv();

  if (env.mockMode) {
    await saveTokens({
      refreshToken: "mock-refresh-token",
      accessToken: "mock-access-token",
      email: MOCK_EMAIL,
      scope: "https://www.googleapis.com/auth/adwords https://www.googleapis.com/auth/analytics.readonly",
      updatedAt: new Date().toISOString(),
      source: "mock",
    });
    return NextResponse.redirect(new URL("/?connected=1", env.appBaseUrl));
  }

  if (!oauthConfigured(env)) {
    return NextResponse.redirect(new URL("/?error=oauth-not-configured", env.appBaseUrl));
  }

  const state = randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("adrunr_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.appBaseUrl.startsWith("https"),
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(buildAuthUrl(state));
}
