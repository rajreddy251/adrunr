"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { CONFIRM_PAUSED_PHRASE, SAFETY_COPY } from "@/lib/safety";
import { formatCustomerId, PLATFORM_MCC_DISPLAY } from "@/lib/ids";
import type { AdsAccount, ConnectionStatus } from "@/lib/types";

type AccountsResponse = {
  ok: boolean;
  accounts?: AdsAccount[];
  warnings?: string[];
  source?: string;
  error?: string;
  hint?: string;
  kind?: string;
};

type CampaignResponse = {
  ok: boolean;
  dryRun?: boolean;
  applied?: boolean;
  status?: string;
  request?: unknown;
  response?: unknown;
  safety?: { note?: string };
  error?: string;
  hint?: string;
};

type Ga4Response = {
  ok: boolean;
  softFail: boolean;
  source: string;
  reason?: string;
  report?: {
    propertyId: string;
    note?: string;
    rows?: Array<{ date: string; sessions: number; conversions: number }>;
    totals?: { sessions: number; conversions: number };
  };
};

const emptyStatus: ConnectionStatus = {
  connected: false,
  mockMode: false,
  email: null,
  source: null,
  oauthConfigured: false,
  adsConfigured: false,
  loginCustomerId: "",
  ga4PropertyId: null,
  scopes: [],
};

export function Dashboard() {
  const [status, setStatus] = useState<ConnectionStatus>(emptyStatus);
  const [accounts, setAccounts] = useState<AdsAccount[]>([]);
  const [accountWarnings, setAccountWarnings] = useState<string[]>([]);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [campaignName, setCampaignName] = useState("Adrunr paused search");
  const [budgetDollars, setBudgetDollars] = useState("1.00");
  const [dryRun, setDryRun] = useState(true);
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [campaignResult, setCampaignResult] = useState<CampaignResponse | null>(null);
  const [ga4, setGa4] = useState<Ga4Response | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    const res = await fetch("/api/auth/status", { cache: "no-store" });
    const json = (await res.json()) as ConnectionStatus;
    setStatus(json);
    return json;
  }, []);

  const loadAccounts = useCallback(async (connected: boolean) => {
    if (!connected) {
      setAccounts([]);
      setAccountWarnings([]);
      setAccountError(null);
      return;
    }
    const res = await fetch("/api/ads/accounts", { cache: "no-store" });
    const json = (await res.json()) as AccountsResponse;
    if (!json.ok) {
      setAccounts([]);
      setAccountError([json.error, json.hint].filter(Boolean).join(" — "));
      setAccountWarnings(json.kind ? [`${json.kind}`] : []);
      return;
    }
    setAccountError(null);
    setAccounts(json.accounts ?? []);
    setAccountWarnings(json.warnings ?? []);
    setSelectedId((current) => current || json.accounts?.find((a) => !a.manager && !a.warning)?.customerId || "");
  }, []);

  const loadGa4 = useCallback(async () => {
    const res = await fetch("/api/ga4/report", { cache: "no-store" });
    setGa4((await res.json()) as Ga4Response);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected")) setBanner("Google connected. Tokens stored server-side only.");
    if (params.get("disconnected")) setBanner("Disconnected. Local token store cleared.");
    if (params.get("error")) setBanner(`OAuth: ${params.get("error")}`);
    void (async () => {
      const next = await loadStatus();
      await Promise.all([loadAccounts(next.connected), loadGa4()]);
    })();
  }, [loadAccounts, loadGa4, loadStatus]);

  const selected = useMemo(
    () => accounts.find((account) => account.customerId === selectedId) ?? null,
    [accounts, selectedId],
  );

  async function disconnect() {
    setBusy("disconnect");
    await fetch("/api/auth/disconnect", { method: "POST" });
    setBanner("Disconnected. Local token store cleared.");
    const next = await loadStatus();
    await loadAccounts(next.connected);
    setBusy(null);
  }

  async function createCampaign(event: FormEvent) {
    event.preventDefault();
    if (!selectedId) {
      setCampaignResult({ ok: false, error: "Select a customer first." });
      return;
    }
    if (!dryRun && confirmPhrase.trim() !== CONFIRM_PAUSED_PHRASE) {
      setCampaignResult({
        ok: false,
        error: `Type ${CONFIRM_PAUSED_PHRASE} to apply a PAUSED campaign. Dry-run is preferred.`,
      });
      return;
    }
    const dailyBudgetMicros = Math.round(Number(budgetDollars) * 1_000_000);
    setBusy("campaign");
    const res = await fetch("/api/ads/campaigns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerId: selectedId,
        name: campaignName,
        dailyBudgetMicros,
        dryRun,
        status: "PAUSED",
      }),
    });
    setCampaignResult((await res.json()) as CampaignResponse);
    setBusy(null);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-5 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-lime-400">Adrunr · ads ops</p>
          <h1 className="mt-1 text-3xl font-medium text-white">Campaign tools, not autopilot.</h1>
          <p className="mt-2 max-w-2xl text-sm text-moss-400">
            Google Ads API + GA4 readonly stub. Marketing site lives in a separate repo. MCC{" "}
            <span className="font-mono text-moss-300">{PLATFORM_MCC_DISPLAY}</span> (red4code) · GCP{" "}
            <span className="font-mono text-moss-300">adrunr-ads-ops</span>
          </p>
        </div>
        <div className="rounded-full border border-ink-700 bg-ink-900 px-3 py-1 font-mono text-xs text-moss-400">
          {status.mockMode ? "mock mode" : status.connected ? "connected" : "disconnected"}
        </div>
      </header>

      <section className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-400">
        <p className="font-medium text-amber-400">{SAFETY_COPY.headline}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-400/90">
          {SAFETY_COPY.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      </section>

      {banner ? (
        <p className="rounded-xl border border-ink-700 bg-ink-900 px-4 py-3 text-sm text-moss-300">{banner}</p>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-2xl border border-ink-700 bg-ink-900 p-5">
          <h2 className="text-lg text-white">Google Ads connection</h2>
          <p className="mt-1 text-sm text-moss-400">
            OAuth 2.0 web flow for the Ads API scope plus Analytics readonly. Tokens persist in{" "}
            <code className="font-mono text-moss-300">.data/tokens.json</code> on the server — never in the browser.
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-moss-500">Account</dt>
              <dd className="font-mono text-moss-300">{status.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-moss-500">Source</dt>
              <dd className="font-mono text-moss-300">{status.source ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-moss-500">Login customer</dt>
              <dd className="font-mono text-moss-300">
                {status.loginCustomerId ? formatCustomerId(status.loginCustomerId) : PLATFORM_MCC_DISPLAY}
              </dd>
            </div>
            <div>
              <dt className="text-moss-500">OAuth / Ads configured</dt>
              <dd className="font-mono text-moss-300">
                {status.oauthConfigured ? "oauth yes" : "oauth missing"} ·{" "}
                {status.adsConfigured ? "token yes" : "dev token missing"}
              </dd>
            </div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-3">
            {status.connected ? (
              <button
                type="button"
                onClick={() => void disconnect()}
                disabled={busy === "disconnect"}
                className="rounded-lg border border-coral-400/40 px-4 py-2 text-sm text-coral-400 hover:bg-coral-400/10 disabled:opacity-50"
              >
                Disconnect
              </button>
            ) : (
              <a
                href="/api/auth/google"
                className="rounded-lg bg-lime-400 px-4 py-2 text-sm font-medium text-ink-950 hover:bg-lime-500"
              >
                Connect Google Ads
              </a>
            )}
            {!status.oauthConfigured && !status.mockMode ? (
              <p className="self-center text-xs text-moss-500">
                Set GOOGLE_CLIENT_ID / SECRET in .env.local, or ADRUNR_MOCK=1 for a local demo.
              </p>
            ) : null}
          </div>
        </article>

        <article className="rounded-2xl border border-ink-700 bg-ink-900 p-5">
          <h2 className="text-lg text-white">GA4 readonly stub</h2>
          <p className="mt-1 text-sm text-moss-400">
            Sample sessions / conversions report. Soft-fails if GA4_PROPERTY_ID or analytics.readonly is missing — the
            console stays usable.
          </p>
          {ga4 ? (
            <div className="mt-4 space-y-3">
              <p className="font-mono text-xs text-moss-500">
                {ga4.source}
                {ga4.softFail ? " · soft-fail" : ""} · property {ga4.report?.propertyId || "unset"}
              </p>
              {ga4.reason ? <p className="text-sm text-amber-400">{ga4.reason}</p> : null}
              {ga4.report?.totals ? (
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Sessions (7d)" value={ga4.report.totals.sessions} />
                  <Stat label="Conversions (7d)" value={ga4.report.totals.conversions} />
                </div>
              ) : null}
              {ga4.report?.rows?.length ? (
                <table className="w-full text-left text-xs">
                  <thead className="text-moss-500">
                    <tr>
                      <th className="py-1 font-medium">Date</th>
                      <th className="py-1 font-medium">Sessions</th>
                      <th className="py-1 font-medium">Conv.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ga4.report.rows.slice(-5).map((row) => (
                      <tr key={row.date} className="border-t border-ink-700 font-mono text-moss-300">
                        <td className="py-1">{row.date}</td>
                        <td className="py-1">{row.sessions}</td>
                        <td className="py-1">{row.conversions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-sm text-moss-500">Loading stub…</p>
          )}
        </article>
      </section>

      <section className="rounded-2xl border border-ink-700 bg-ink-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg text-white">Accessible customers</h2>
          <button
            type="button"
            onClick={() => void loadAccounts(status.connected)}
            className="font-mono text-xs text-lime-400 hover:underline"
            disabled={!status.connected}
          >
            Refresh
          </button>
        </div>
        <p className="mt-1 text-sm text-moss-400">
          Listed under login-customer-id {PLATFORM_MCC_DISPLAY}. Test Account developer tokens cannot manage production
          accounts until Basic Access.
        </p>
        {accountError ? <p className="mt-3 text-sm text-coral-400">{accountError}</p> : null}
        {accountWarnings.map((warning) => (
          <p key={warning} className="mt-2 text-sm text-amber-400">
            {warning}
          </p>
        ))}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-moss-500">
              <tr>
                <th className="pb-2 font-medium">Customer</th>
                <th className="pb-2 font-medium">ID</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Type</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-moss-500">
                    {status.connected
                      ? "No customers returned. Check developer-token access and MCC."
                      : "Connect Google Ads to list customers under the MCC."}
                  </td>
                </tr>
              ) : (
                accounts.map((account) => (
                  <tr key={account.customerId} className="border-t border-ink-700">
                    <td className="py-3">
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="radio"
                          name="customer"
                          className="mt-1 accent-lime-400"
                          checked={selectedId === account.customerId}
                          onChange={() => setSelectedId(account.customerId)}
                          disabled={Boolean(account.warning)}
                        />
                        <span>
                          <span className="block text-white">{account.descriptiveName}</span>
                          {account.warning ? (
                            <span className="mt-1 block text-xs text-amber-400">{account.warning}</span>
                          ) : null}
                        </span>
                      </label>
                    </td>
                    <td className="py-3 font-mono text-moss-300">{account.formattedId}</td>
                    <td className="py-3 font-mono text-xs">{account.status}</td>
                    <td className="py-3 text-xs text-moss-400">
                      {account.manager ? "manager" : "client"}
                      {account.testAccount ? " · test" : ""}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-ink-700 bg-ink-900 p-5">
        <h2 className="text-lg text-white">Create Search campaign (PAUSED)</h2>
        <p className="mt-1 text-sm text-moss-400">
          Dry-run sends <code className="font-mono text-moss-300">validateOnly</code> and returns the mutate payload
          without applying spend. Unchecking dry-run still creates PAUSED only — there is no enable path in this MVP.
        </p>
        <form onSubmit={(event) => void createCampaign(event)} className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="text-moss-500">Campaign name</span>
            <input
              value={campaignName}
              onChange={(event) => setCampaignName(event.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-white outline-none focus:border-lime-400"
            />
          </label>
          <label className="block text-sm">
            <span className="text-moss-500">Daily budget (USD, required by API — campaign stays paused)</span>
            <input
              value={budgetDollars}
              onChange={(event) => setBudgetDollars(event.target.value)}
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 font-mono text-white outline-none focus:border-lime-400"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-moss-300">
            <input
              type="checkbox"
              className="accent-lime-400"
              checked={dryRun}
              onChange={(event) => {
                setDryRun(event.target.checked);
                if (event.target.checked) setConfirmPhrase("");
              }}
            />
            Dry-run (preferred) — validate payload, do not apply
          </label>
          {!dryRun ? (
            <label className="block text-sm md:col-span-2">
              <span className="text-amber-400">
                Type {CONFIRM_PAUSED_PHRASE} to apply a PAUSED campaign. This still cannot spend.
              </span>
              <input
                value={confirmPhrase}
                onChange={(event) => setConfirmPhrase(event.target.value)}
                className="mt-1 w-full rounded-lg border border-amber-400/40 bg-ink-950 px-3 py-2 font-mono text-white outline-none focus:border-amber-400"
              />
            </label>
          ) : null}
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={!status.connected || busy === "campaign" || !selected || Boolean(selected.warning)}
              className="rounded-lg bg-lime-400 px-4 py-2 text-sm font-medium text-ink-950 hover:bg-lime-500 disabled:opacity-40"
            >
              {dryRun ? "Validate paused campaign" : "Create paused campaign"}
            </button>
          </div>
        </form>
        {campaignResult ? (
          <pre className="mt-4 max-h-80 overflow-auto rounded-xl border border-ink-700 bg-ink-950 p-4 font-mono text-xs text-moss-300">
            {JSON.stringify(campaignResult, null, 2)}
          </pre>
        ) : null}
      </section>

      <footer className="pb-8 text-xs text-moss-500">
        Adrunr MVP · Google Ads REST + official googleapis OAuth · no secrets in git · marketing site is adrunr-site
      </footer>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-950 px-3 py-2">
      <p className="text-xs text-moss-500">{label}</p>
      <p className="font-mono text-xl text-white">{value}</p>
    </div>
  );
}
