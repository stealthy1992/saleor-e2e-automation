# k6 + Grafana Performance Setup — Saleor Dashboard

Local-only performance testing for the Saleor Dashboard, covering two flows:
1. **Product variant creation** (`tests/k6/scenarios/product-variant-creation.js`) — mirrors `products.spec.js`
2. **Order refunds, partial + complete** (`tests/k6/scenarios/order-refund.js`) — mirrors `order.spec.js`

Metrics: p95 request duration and error rate, tracked against p95 < 500ms / error rate < 1%.

## Known issue this setup already fixed — read before running

An earlier version of `order-refund.js` queried Saleor for "any existing
paid order" to build its refund pool. That swept up orders created by
`checkout.spec.js`, which (unlike the `checkout.js` fixture) does its own
manual checkout with **no teardown** — every run of that spec leaves a
real order behind. Running the perf scenario against those repeatedly
refunded a growing number of unrelated "Mack Travolta" test orders,
visible in the Dashboard as orders unexpectedly showing "Fully refunded".

Current version seeds its **own** orders via guest checkout (see
`lib/checkout-seed.js`), each under an email like
`perf-order-3-1732650000000@loadtest.local` — never queries for or
touches an order it didn't create itself. This is why
`TEST_CHECKOUT_VARIANT_ID` (step 4 below) is now required.

Also fixed: the original success/failure checking only looked at the
GraphQL **top-level** `errors` field. Saleor mutations return HTTP 200
with no top-level errors even when the mutation itself was business-
rejected — rejection shows up nested inside the mutation's own payload
(e.g. `data.orderRefund.errors`), exactly the pattern every fixture in
your repo (`product.js`, `checkout.js`, `catalog.spec.js`) already checks
for. `lib/graphql.js` now checks both levels, and each scenario prints
real success/rejection counts (`variant_created_success` /
`variant_created_rejected`, `refund_succeeded` / `refund_rejected`) —
visible in the HTML report's "Other Stats" tab and on the Grafana
dashboard's "Business-Level Outcomes" panel — instead of a `0% failed`
number that only ever measured transport failures.

## 1. Install k6 on Windows

```powershell
choco install k6
# or: winget install k6 --source winget
k6 version   # confirm it's on PATH
```

## 2. Drop these files into your Saleor e2e repo

```
saleor-e2e-automation/                    <- repo root
├── docker-compose.perf.yml
├── Jenkinsfile                            <- replaces your existing one
├── grafana/
│   ├── provisioning/
│   │   ├── datasources/influxdb.yml
│   │   └── dashboards/dashboard.yml
│   └── dashboards/saleor-k6-dashboard.json
├── reports/
│   └── .gitkeep
├── scripts/
│   └── run-perf-tests.ps1
└── tests/k6/
    ├── lib/
    │   ├── graphql.js
    │   ├── auth.js
    │   ├── checkout-seed.js
    │   └── report.js
    └── scenarios/
        ├── product-variant-creation.js
        └── order-refund.js
```

## 3. Bring up the perf stack

```powershell
docker compose -f docker-compose.perf.yml up -d
```

- InfluxDB: `http://localhost:8086` (database `k6`, auto-created)
- Grafana: `http://localhost:3000` - anonymous viewer access is enabled, or log in as `admin` / `admin` (change this - see compose file comment) to edit. The **"Saleor Dashboard - k6 Performance"** dashboard auto-loads via provisioning; no manual import needed.

This stack is meant to stay running - it's not part of the per-build teardown, so history accumulates across builds.

## 4. Seed test data

Two dedicated pieces of data, each isolated from your functional Playwright suite:

- **`TEST_PRODUCT_ID`** - a product dedicated to perf runs, not touched by your functional Playwright suite. `attributes: []` in `product-variant-creation.js` is confirmed valid by `product.js`'s own `productVariant` fixture, which creates a variant the same way. If your product's type has mandatory variant-selection attributes, the `variant_created_rejected` counter (and the printed rejection reason) will tell you immediately - no more guessing after the fact.
- **`TEST_CHECKOUT_VARIANT_ID`** - a variant with stock and a `default-channel` price. `order-refund.js` uses this to seed its own pool of orders via guest checkout at the start of every run (see `lib/checkout-seed.js`) - it no longer queries for or touches any pre-existing order. Each seed consumes one unit of real stock; if you run this enough times to exhaust it, restock the variant or point at one with a large quantity.

Seeded orders are **not** cleaned up after a run - Saleor has no `orderDelete` for finalized orders (only `draftOrderDelete`; `checkout.js`'s teardown uses a direct SQL hard-delete, which k6 can't do without a Postgres-capable extension). They accumulate under the `perf-order-*@loadtest.local` pattern, clearly separate from real or fixture data, and easy to find later if you want to build a small cleanup script reusing `checkout.js`'s `hardDeleteOrders()` pattern (filtered by that email pattern, not by status).

## 5. Run locally before wiring into Jenkins

Easiest: use the provided script, which validates both IDs are set and only opens the reports it actually generates.

```powershell
$env:SALEOR_ADMIN_EMAIL = "<your admin email>"
$env:SALEOR_ADMIN_PASSWORD = "<your admin password>"
$env:TEST_PRODUCT_ID = "<product id>"
$env:TEST_CHECKOUT_VARIANT_ID = "<variant id>"

.\scripts\run-perf-tests.ps1
# or run one scenario at a time:
.\scripts\run-perf-tests.ps1 -VariantOnly
.\scripts\run-perf-tests.ps1 -RefundOnly
```

Or run each scenario directly:

```powershell
k6 run tests/k6/scenarios/product-variant-creation.js `
    --out influxdb=http://localhost:8086/k6 `
    -e SALEOR_API_URL=$env:SALEOR_API_URL `
    -e SALEOR_ADMIN_EMAIL=$env:SALEOR_ADMIN_EMAIL `
    -e SALEOR_ADMIN_PASSWORD=$env:SALEOR_ADMIN_PASSWORD `
    -e TEST_PRODUCT_ID=$env:TEST_PRODUCT_ID

k6 run tests/k6/scenarios/order-refund.js `
    --out influxdb=http://localhost:8086/k6 `
    -e SALEOR_API_URL=$env:SALEOR_API_URL `
    -e SALEOR_ADMIN_EMAIL=$env:SALEOR_ADMIN_EMAIL `
    -e SALEOR_ADMIN_PASSWORD=$env:SALEOR_ADMIN_PASSWORD `
    -e TEST_CHECKOUT_VARIANT_ID=$env:TEST_CHECKOUT_VARIANT_ID
```

Watch the Grafana dashboard update in near real time while these run. After each run, check the console output (or the HTML report's "Other Stats" tab) for the `variant_created_rejected` / `refund_rejected` counts - a nonzero number there is real, actionable signal that the previous setup silently hid.

## 6. Jenkins

The updated `Jenkinsfile` adds two stages after the Playwright stage:
- **Bring up k6 performance stack** - idempotent `docker compose up -d`, not torn down in cleanup
- **Run k6 Performance Tests** - runs both scenarios, marks the build `unstable` (not `failure`) on threshold breach, same pattern as the existing Playwright stage

No new Jenkins credentials are needed - it reuses `SALEOR_ADMIN_EMAIL` / `SALEOR_ADMIN_PASSWORD`, already configured for the Playwright stage.

Two build parameters are now required - the k6 stage skips itself if either is blank:
- **`TEST_PRODUCT_ID`**
- **`TEST_CHECKOUT_VARIANT_ID`**

Trigger builds with "Build with Parameters" and fill both in, or hardcode defaults in the `parameters` block once you've settled on permanent perf test data.

## 7. Node.js dependency check

k6 test scripts run in k6's own JS runtime, not Node - nothing to add to `package.json`. They use ES `import`/`export` syntax (not CommonJS `require`) because that's what k6's runtime requires; this is unrelated to and doesn't affect your Playwright code style.
