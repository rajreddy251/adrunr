import { assertPausedOnly, resolveDryRun } from "./safety";
import { digitsOnly } from "./ids";

export type CampaignCreateInput = {
  customerId: string;
  name: string;
  dailyBudgetMicros: number;
  dryRun?: unknown;
};

export type MutateRequest = {
  customerId: string;
  validateOnly: boolean;
  responseContentType: "MUTABLE_RESOURCE";
  mutateOperations: Array<Record<string, unknown>>;
};

const MIN_BUDGET_MICROS = 10_000; // $0.01 — required field; campaign stays PAUSED

export function parseCampaignInput(body: unknown): CampaignCreateInput {
  const raw = (body ?? {}) as Record<string, unknown>;
  const customerId = digitsOnly(String(raw.customerId ?? ""));
  const name = String(raw.name ?? "").trim();
  const dailyBudgetMicros = Number(raw.dailyBudgetMicros);

  if (!customerId) {
    throw Object.assign(new Error("customerId is required."), { status: 400 });
  }
  if (!name) {
    throw Object.assign(new Error("Campaign name is required."), { status: 400 });
  }
  if (!Number.isFinite(dailyBudgetMicros) || dailyBudgetMicros < MIN_BUDGET_MICROS) {
    throw Object.assign(
      new Error(`dailyBudgetMicros must be an integer >= ${MIN_BUDGET_MICROS} (API requires a budget; campaign stays PAUSED).`),
      { status: 400 },
    );
  }
  if (raw.status) {
    assertPausedOnly(String(raw.status));
  }

  return {
    customerId,
    name,
    dailyBudgetMicros: Math.trunc(dailyBudgetMicros),
    dryRun: raw.dryRun,
  };
}

export function buildPausedSearchCampaignMutate(
  input: CampaignCreateInput,
): MutateRequest {
  const customerId = digitsOnly(input.customerId);
  const dryRun = resolveDryRun(input.dryRun);
  const budgetResourceName = `customers/${customerId}/campaignBudgets/-1`;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  return {
    customerId,
    validateOnly: dryRun,
    responseContentType: "MUTABLE_RESOURCE",
    mutateOperations: [
      {
        campaignBudgetOperation: {
          create: {
            resourceName: budgetResourceName,
            name: `${input.name} budget ${stamp}`,
            amountMicros: String(input.dailyBudgetMicros),
            deliveryMethod: "STANDARD",
            explicitlyShared: false,
          },
        },
      },
      {
        campaignOperation: {
          create: {
            name: input.name,
            status: "PAUSED",
            advertisingChannelType: "SEARCH",
            campaignBudget: budgetResourceName,
            containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
            manualCpc: { enhancedCpcEnabled: false },
            networkSettings: {
              targetGoogleSearch: true,
              targetSearchNetwork: true,
              targetContentNetwork: false,
              targetPartnerSearchNetwork: false,
            },
          },
        },
      },
    ],
  };
}
