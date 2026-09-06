import "server-only";

import { google } from "googleapis";

import { getEnv } from "./env";
import { saveTokens, type StoredTokens } from "./token-store";

export const ADS_SCOPE = "https://www.googleapis.com/auth/adwords";
export const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

export const OAUTH_SCOPES = [
  ADS_SCOPE,
  GA4_SCOPE,
  "openid",
  "email",
  "profile",
] as const;

export function createOAuthClient(redirectUri?: string) {
  const env = getEnv();
  return new google.auth.OAuth2(
    env.googleClientId,
    env.googleClientSecret,
    redirectUri ?? env.oauthRedirectUri,
  );
}

export function buildAuthUrl(state: string): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: [...OAUTH_SCOPES],
    state,
  });
}

export async function exchangeCode(code: string): Promise<StoredTokens> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token && !tokens.access_token) {
    throw new Error("Google did not return tokens. Re-run Connect with prompt=consent.");
  }

  client.setCredentials(tokens);
  let email: string | undefined;
  try {
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const me = await oauth2.userinfo.get();
    email = me.data.email ?? undefined;
  } catch {
    email = undefined;
  }

  const stored: StoredTokens = {
    refreshToken: tokens.refresh_token ?? "",
    accessToken: tokens.access_token ?? undefined,
    expiryDate: tokens.expiry_date ?? undefined,
    email,
    scope: tokens.scope ?? OAUTH_SCOPES.join(" "),
    updatedAt: new Date().toISOString(),
    source: "oauth",
  };

  if (!stored.refreshToken) {
    stored.refreshToken = `access-only:${stored.accessToken ?? ""}`;
  }

  await saveTokens(stored);
  return stored;
}

export async function getAccessToken(tokens: StoredTokens): Promise<string> {
  const env = getEnv();
  if (env.mockMode || tokens.source === "mock") {
    return "mock-access-token";
  }

  const client = createOAuthClient();
  const refreshToken = tokens.refreshToken.startsWith("access-only:")
    ? undefined
    : tokens.refreshToken;

  client.setCredentials({
    refresh_token: refreshToken,
    access_token: tokens.accessToken,
    expiry_date: tokens.expiryDate,
  });

  const result = await client.getAccessToken();
  if (!result.token) {
    throw new Error("Unable to obtain a Google access token. Disconnect and Connect again.");
  }
  return result.token;
}
