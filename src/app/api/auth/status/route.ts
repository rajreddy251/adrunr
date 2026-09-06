import { adsConfigured, getEnv, oauthConfigured } from "@/lib/env";
import { OAUTH_SCOPES } from "@/lib/oauth";
import { loadTokens } from "@/lib/token-store";
import type { ConnectionStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const env = getEnv();
  const tokens = await loadTokens();

  const body: ConnectionStatus = {
    connected: Boolean(tokens),
    mockMode: env.mockMode,
    email: tokens?.email ?? (tokens?.source === "env" ? "env refresh token" : null),
    source: tokens?.source ?? null,
    oauthConfigured: oauthConfigured(env),
    adsConfigured: adsConfigured(env),
    loginCustomerId: env.loginCustomerId,
    ga4PropertyId: env.ga4PropertyId || null,
    scopes: [...OAUTH_SCOPES],
  };

  return Response.json(body);
}
