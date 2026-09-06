import "server-only";

import { google } from "googleapis";

import { getEnv } from "./env";
import { mockGa4Report } from "./mock-data";
import { createOAuthClient, GA4_SCOPE } from "./oauth";
import { loadTokens } from "./token-store";

export type Ga4ReportResult = {
  ok: boolean;
  softFail: boolean;
  source: "live" | "mock" | "stub";
  reason?: string;
  report?: ReturnType<typeof mockGa4Report> & {
    rows?: Array<{ date: string; sessions: number; conversions: number }>;
  };
};

function stub(reason: string, propertyId: string): Ga4ReportResult {
  return {
    ok: false,
    softFail: true,
    source: "stub",
    reason,
    report: {
      ...mockGa4Report(propertyId),
      source: "stub",
      note: reason,
    },
  };
}

export async function runGa4SampleReport(): Promise<Ga4ReportResult> {
  const env = getEnv();
  if (env.mockMode) {
    return {
      ok: true,
      softFail: false,
      source: "mock",
      report: mockGa4Report(env.ga4PropertyId),
    };
  }

  if (!env.ga4PropertyId) {
    return stub(
      "GA4_PROPERTY_ID is not set. Readonly stub is idle — add a property id to .env.local to query the Data API.",
      "",
    );
  }

  const tokens = await loadTokens();
  if (!tokens) {
    return stub("Connect Google Ads/Analytics first. GA4 uses the same OAuth grant (analytics.readonly).", env.ga4PropertyId);
  }

  const scopes = tokens.scope ?? "";
  if (tokens.source !== "mock" && scopes && !scopes.includes(GA4_SCOPE) && !scopes.includes("analytics.readonly")) {
    return stub(
      "Connected token is missing analytics.readonly. Disconnect and Connect again to grant the GA4 scope.",
      env.ga4PropertyId,
    );
  }

  try {
    const client = createOAuthClient();
    const refreshToken = tokens.refreshToken.startsWith("access-only:")
      ? undefined
      : tokens.refreshToken;
    client.setCredentials({
      refresh_token: refreshToken,
      access_token: tokens.accessToken,
      expiry_date: tokens.expiryDate,
    });

    const analyticsdata = google.analyticsdata({ version: "v1beta", auth: client });
    const result = await analyticsdata.properties.runReport({
      property: `properties/${env.ga4PropertyId}`,
      requestBody: {
        dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "sessions" }, { name: "conversions" }],
      },
    });

    const rows = (result.data.rows ?? []).map((row) => ({
      date: row.dimensionValues?.[0]?.value ?? "",
      sessions: Number(row.metricValues?.[0]?.value ?? 0),
      conversions: Number(row.metricValues?.[1]?.value ?? 0),
    }));

    const totals = rows.reduce(
      (acc, row) => {
        acc.sessions += row.sessions;
        acc.conversions += row.conversions;
        return acc;
      },
      { sessions: 0, conversions: 0 },
    );

    return {
      ok: true,
      softFail: false,
      source: "live",
      report: {
        propertyId: env.ga4PropertyId,
        stub: false,
        source: "live",
        dateRange: { startDate: "7daysAgo", endDate: "today" },
        metrics: ["sessions", "conversions"],
        rows,
        totals,
        note: "GA4 Data API readonly sample (sessions + conversions by date).",
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "GA4 Data API request failed.";
    return stub(`GA4 soft-fail: ${message}`, env.ga4PropertyId);
  }
}
