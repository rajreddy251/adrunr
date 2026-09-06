import "server-only";

import { AdsApiError } from "./ads-errors";
import { buildPausedSearchCampaignMutate, parseCampaignInput } from "./campaign";
import { adsConfigured, getEnv } from "./env";
import {
  digitsOnly,
  formatCustomerId,
  isKnownNotEnabledCustomer,
  parseCustomerResourceName,
  PLATFORM_MCC_ID,
} from "./ids";
import { mockAccounts } from "./mock-data";
import { getAccessToken } from "./oauth";
import { loadTokens } from "./token-store";
import type { AdsAccount } from "./types";

const CUSTOMER_CLIENT_QUERY = `
  SELECT
    customer_client.client_customer,
    customer_client.descriptive_name,
    customer_client.id,
    customer_client.manager,
    customer_client.status,
    customer_client.level,
    customer_client.test_account
  FROM customer_client
  WHERE customer_client.level <= 1
`.trim();

async function adsFetch(
  path: string,
  init: {
    method?: string;
    body?: unknown;
    customerId?: string;
    accessToken: string;
  },
): Promise<unknown> {
  const env = getEnv();
  const url = `https://googleads.googleapis.com/${env.adsApiVersion}/${path.replace(/^\//, "")}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${init.accessToken}`,
    "developer-token": env.adsDeveloperToken,
    "content-type": "application/json",
    "login-customer-id": env.loginCustomerId || PLATFORM_MCC_ID,
  };

  const response = await fetch(url, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });

  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { message: text };
    }
  }

  if (!response.ok) {
    throw new AdsApiError(response.status, json ?? { message: text }, init.customerId);
  }
  return json;
}

async function requireLiveContext() {
  const env = getEnv();
  const tokens = await loadTokens();
  if (!tokens) {
    throw Object.assign(new Error("Google Ads is not connected."), {
      status: 401,
      info: {
        kind: "not_connected",
        hint: "Click Connect Google Ads, or set GOOGLE_ADS_REFRESH_TOKEN / ADRUNR_MOCK=1.",
      },
    });
  }
  if (!adsConfigured(env)) {
    throw Object.assign(new Error("GOOGLE_ADS_DEVELOPER_TOKEN is not set."), {
      status: 400,
      info: {
        kind: "developer_token",
        hint: "Add the Test Account developer token to .env.local. Production MCC access needs Basic Access approval.",
      },
    });
  }
  const accessToken = await getAccessToken(tokens);
  return { env, tokens, accessToken };
}

function rowToAccount(row: Record<string, unknown>): AdsAccount {
  const client = (row.customerClient ?? row.customer ?? {}) as Record<string, unknown>;
  const customerId = digitsOnly(
    String(client.id ?? parseCustomerResourceName(String(client.clientCustomer ?? ""))),
  );
  const warning = isKnownNotEnabledCustomer(customerId)
    ? "CUSTOMER_NOT_ENABLED — known for 485-651-7690. Listed for visibility; mutations are blocked."
    : null;

  return {
    customerId,
    descriptiveName: String(client.descriptiveName ?? "Untitled customer"),
    formattedId: formatCustomerId(customerId),
    manager: Boolean(client.manager),
    status: warning ? "CUSTOMER_NOT_ENABLED" : String(client.status ?? "UNKNOWN"),
    testAccount: Boolean(client.testAccount),
    level: typeof client.level === "number" ? client.level : client.level ? Number(client.level) : null,
    warning,
  };
}

export async function listAccounts(): Promise<{
  accounts: AdsAccount[];
  source: "live" | "mock";
  loginCustomerId: string;
  warnings: string[];
}> {
  const env = getEnv();
  if (env.mockMode) {
    return {
      accounts: mockAccounts(),
      source: "mock",
      loginCustomerId: env.loginCustomerId,
      warnings: [
        "ADRUNR_MOCK is on. These accounts are fixtures, including known CUSTOMER_NOT_ENABLED 485-651-7690.",
      ],
    };
  }

  const { accessToken } = await requireLiveContext();
  const warnings: string[] = [];
  const loginCustomerId = env.loginCustomerId;
  let accounts: AdsAccount[] = [];

  try {
    const search = (await adsFetch(`customers/${loginCustomerId}/googleAds:search`, {
      method: "POST",
      accessToken,
      customerId: loginCustomerId,
      body: { query: CUSTOMER_CLIENT_QUERY },
    })) as { results?: Array<Record<string, unknown>> };

    accounts = (search.results ?? []).map(rowToAccount);
  } catch (error) {
    if (error instanceof AdsApiError) {
      warnings.push(`${error.info.code}: ${error.info.message} — ${error.info.hint}`);
    } else {
      warnings.push(error instanceof Error ? error.message : "MCC customer_client search failed.");
    }
  }

  if (accounts.length === 0) {
    try {
      const listed = (await adsFetch("customers:listAccessibleCustomers", {
        accessToken,
      })) as { resourceNames?: string[] };

      const ids = (listed.resourceNames ?? []).map(parseCustomerResourceName);
      const enriched: AdsAccount[] = [];
      for (const id of ids) {
        try {
          const search = (await adsFetch(`customers/${id}/googleAds:search`, {
            method: "POST",
            accessToken,
            customerId: id,
            body: {
              query: "SELECT customer.id, customer.descriptive_name, customer.manager, customer.test_account, customer.status FROM customer LIMIT 1",
            },
          })) as { results?: Array<Record<string, unknown>> };
          const row = search.results?.[0];
          enriched.push(
            row
              ? rowToAccount(row)
              : {
                  customerId: id,
                  descriptiveName: "Accessible customer",
                  formattedId: formatCustomerId(id),
                  manager: false,
                  status: "UNKNOWN",
                  testAccount: false,
                  level: null,
                  warning: isKnownNotEnabledCustomer(id)
                    ? "CUSTOMER_NOT_ENABLED — known for 485-651-7690."
                    : null,
                },
          );
        } catch (error) {
          const info = error instanceof AdsApiError ? error.info : null;
          enriched.push({
            customerId: id,
            descriptiveName: info?.kind === "customer_not_enabled" ? "Not enabled" : "Unreadable customer",
            formattedId: formatCustomerId(id),
            manager: false,
            status: info?.kind === "customer_not_enabled" ? "CUSTOMER_NOT_ENABLED" : "ERROR",
            testAccount: false,
            level: null,
            warning: info ? `${info.code}: ${info.hint}` : error instanceof Error ? error.message : "Lookup failed",
          });
        }
      }
      accounts = enriched;
    } catch (error) {
      if (error instanceof AdsApiError) {
        throw error;
      }
      throw error;
    }
  }

  return { accounts, source: "live", loginCustomerId, warnings };
}

export async function createPausedSearchCampaign(body: unknown): Promise<{
  dryRun: boolean;
  applied: boolean;
  status: "PAUSED";
  request: ReturnType<typeof buildPausedSearchCampaignMutate>;
  response: unknown;
  source: "live" | "mock";
}> {
  const input = parseCampaignInput(body);
  const request = buildPausedSearchCampaignMutate(input);
  const env = getEnv();

  if (isKnownNotEnabledCustomer(input.customerId)) {
    throw Object.assign(
      new Error("Refusing mutate on known CUSTOMER_NOT_ENABLED account 485-651-7690."),
      {
        status: 400,
        info: {
          kind: "customer_not_enabled",
          hint: "Pick an enabled customer under MCC 857-080-5596.",
        },
      },
    );
  }

  if (env.mockMode) {
    return {
      dryRun: request.validateOnly,
      applied: !request.validateOnly,
      status: "PAUSED",
      request,
      response: {
        validateOnly: request.validateOnly,
        mock: true,
        note: request.validateOnly
          ? "Dry-run: mutate payload validated locally. Nothing was sent to Google Ads."
          : "Mock apply: would create a PAUSED Search campaign. No live mutate executed.",
      },
      source: "mock",
    };
  }

  const { accessToken } = await requireLiveContext();
  const response = await adsFetch(`customers/${request.customerId}/googleAds:mutate`, {
    method: "POST",
    accessToken,
    customerId: request.customerId,
    body: {
      mutateOperations: request.mutateOperations,
      validateOnly: request.validateOnly,
      responseContentType: request.responseContentType,
    },
  });

  return {
    dryRun: request.validateOnly,
    applied: !request.validateOnly,
    status: "PAUSED",
    request,
    response,
    source: "live",
  };
}
