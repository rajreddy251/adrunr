import { digitsOnly, PLATFORM_MCC_ID } from "./ids";

export type AppEnv = {
  googleClientId: string;
  googleClientSecret: string;
  oauthRedirectUri: string;
  adsDeveloperToken: string;
  loginCustomerId: string;
  adsRefreshToken: string;
  adsApiVersion: string;
  ga4PropertyId: string;
  appBaseUrl: string;
  mockMode: boolean;
};

function read(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function getEnv(): AppEnv {
  const login = digitsOnly(read("GOOGLE_ADS_LOGIN_CUSTOMER_ID")) || PLATFORM_MCC_ID;
  return {
    googleClientId: read("GOOGLE_CLIENT_ID"),
    googleClientSecret: read("GOOGLE_CLIENT_SECRET"),
    oauthRedirectUri:
      read("GOOGLE_OAUTH_REDIRECT_URI") ||
      `${read("APP_BASE_URL") || "http://localhost:3000"}/api/auth/google/callback`,
    adsDeveloperToken: read("GOOGLE_ADS_DEVELOPER_TOKEN"),
    loginCustomerId: login,
    adsRefreshToken: read("GOOGLE_ADS_REFRESH_TOKEN"),
    adsApiVersion: read("GOOGLE_ADS_API_VERSION") || "v19",
    ga4PropertyId: read("GA4_PROPERTY_ID"),
    appBaseUrl: read("APP_BASE_URL") || "http://localhost:3000",
    mockMode: read("ADRUNR_MOCK") === "1" || read("ADRUNR_MOCK") === "true",
  };
}

export function oauthConfigured(env = getEnv()): boolean {
  return Boolean(env.googleClientId && env.googleClientSecret) || env.mockMode;
}

export function adsConfigured(env = getEnv()): boolean {
  return Boolean(env.adsDeveloperToken) || env.mockMode;
}
