export const SAFETY_COPY = {
  headline: "Ops tools, not autopilot. No spend without an explicit confirm.",
  bullets: [
    "Developer token is Test Account access until Basic Access is approved. Production MCC reads can fail or be limited.",
    "New Search campaigns are created PAUSED. Dry-run (validateOnly) is the default and preferred path.",
    "MVP has no enable/go-live action. A paused campaign with a budget still cannot spend until separately enabled outside this app.",
  ],
} as const;

export const CONFIRM_PAUSED_PHRASE = "CREATE PAUSED";

export type CampaignStatus = "PAUSED" | "ENABLED" | "REMOVED";

export function assertPausedOnly(status: string | undefined): "PAUSED" {
  if (status && status !== "PAUSED") {
    throw new Error(
      `Refusing status ${status}. Adrunr MVP only creates PAUSED campaigns and has no enable path.`,
    );
  }
  return "PAUSED";
}

export function resolveDryRun(dryRun: unknown): boolean {
  if (dryRun === false || dryRun === "false" || dryRun === 0) {
    return false;
  }
  return true;
}
