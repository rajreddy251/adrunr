# Adrunr

In-house ads ops for Google Ads + a GA4 readonly stub. AdKit/Synter-style tools — not autopilot.

The marketing site is a **separate repo** (`adrunr-site`). This repo is the ops app only.

## Safety (read first)

- Developer token is **Test Account** access until **Basic Access** is approved. Listing or mutating production accounts under MCC `857-080-5596` (red4code) will often fail until then. The UI surfaces those errors instead of failing silently.
- New Search campaigns are created **PAUSED**. Dry-run (`validateOnly`) is the default and preferred path.
- There is **no enable / go-live action** in this MVP. A paused campaign cannot spend until it is enabled outside this app.
- **No spend without an explicit confirm.** Applying a paused create requires typing `CREATE PAUSED`. Budgets are required by the Ads API; they do not serve while the campaign is paused.
- Customer `485-651-7690` may return `CUSTOMER_NOT_ENABLED`. That is treated as a known, non-fatal listing warning. Mutates against it are refused.

Platform notes (not secrets): GCP project `adrunr-ads-ops`, MCC `857-080-5596`.

## Stack

- Next.js 15 App Router + TypeScript
- Official [`googleapis`](https://github.com/googleapis/google-api-nodejs-client) (`google.auth.OAuth2` + Analytics Data API)
- Google Ads **REST** API (official HTTP surface) — avoids gRPC/`google-ads-node` bundling issues in Next.js
- Server-side token store: `.data/tokens.json` (gitignored). Optional env refresh token for headless use.

## Setup

```bash
npm install
cp .env.example .env.local
# fill .env.local — never commit it
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | for live OAuth | OAuth web client id (GCP project `adrunr-ads-ops`) |
| `GOOGLE_CLIENT_SECRET` | for live OAuth | OAuth web client secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | for live OAuth | Must match the client, default `http://localhost:3000/api/auth/google/callback` |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | for live Ads | Test Account token until Basic Access |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | recommended | MCC / login-customer-id. Default `857-080-5596` |
| `GOOGLE_ADS_REFRESH_TOKEN` | optional | Seed tokens without the browser flow |
| `GOOGLE_ADS_API_VERSION` | optional | REST version, default `v19` |
| `GA4_PROPERTY_ID` | optional | GA4 Data API property. Soft-fails if unset |
| `APP_BASE_URL` | optional | Default `http://localhost:3000` |
| `ADRUNR_MOCK` | optional | `1` = local/CI demo, no live Google calls |

Local secrets live in `.env` or `.env.local` only. `.env.example` is the committed template.

### Google Cloud / Ads checklist

1. In GCP project `adrunr-ads-ops`, create an OAuth **Web application** client.
2. Authorized redirect URI: `http://localhost:3000/api/auth/google/callback`.
3. Enable the **Google Ads API**. Add the developer token from the MCC (`857-080-5596`) API Center.
4. Optional: enable **Google Analytics Data API** and set `GA4_PROPERTY_ID`.
5. Connect in the app. Scopes requested: `adwords` + `analytics.readonly`.

## Flows

1. **Connect** — `/api/auth/google` starts the OAuth web flow. Callback stores refresh/access tokens server-side. **Disconnect** clears `.data/tokens.json`.
2. **List accounts** — `GET /api/ads/accounts` queries `customer_client` under the MCC login-customer-id, then falls back to `customers:listAccessibleCustomers`. Names and ids are shown; Test Account / `CUSTOMER_NOT_ENABLED` errors are mapped to readable hints.
3. **Paused / dry-run create** — `POST /api/ads/campaigns` with `{ customerId, name, dailyBudgetMicros, dryRun, confirmPhrase }`. Always `status: PAUSED`. `dryRun` (default `true`) sets `validateOnly` and returns the mutate payload without applying. `dryRun: false` still creates PAUSED only and **requires** `confirmPhrase` exactly `CREATE PAUSED` (enforced server-side, not just in the UI).
4. **GA4 stub** — `GET /api/ga4/report` runs a 7-day sessions + conversions sample. Missing property id, missing Analytics scope, or API errors **soft-fail** with a placeholder so Ads ops keep working.

## Demo without Google credentials

```bash
ADRUNR_MOCK=1 npm run dev
```

Connect writes a mock token. Accounts include the MCC, a test client, and known-disabled `485-651-7690`. Campaign create returns the payload without calling Google.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` / `npm start` | production |
| `npm test` | unit tests (payload safety, id helpers, error mapping) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | Next ESLint |
| `npm run check` | typecheck + test + lint |

CI runs those plus `npm run build` with `ADRUNR_MOCK=1` and no secrets.

## API sketch

- `GET /api/auth/status` — connection + config flags (no secrets)
- `GET /api/auth/google` — start OAuth (or mock connect)
- `GET /api/auth/google/callback` — exchange code, persist tokens
- `POST /api/auth/disconnect`
- `GET /api/ads/accounts`
- `POST /api/ads/campaigns`
- `GET /api/ga4/report`
- `GET /api/health`
