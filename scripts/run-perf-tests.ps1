# scripts/run-perf-tests.ps1
#
# One-command local run: brings up the InfluxDB+Grafana stack if it's not
# already running, runs all three k6 scenarios (writing to InfluxDB for the
# live Grafana dashboard AND to a standalone HTML report per scenario),
# then opens the Grafana dashboard and only the report(s) this run
# actually produced.
#
# Usage:
#   .\scripts\run-perf-tests.ps1
#   .\scripts\run-perf-tests.ps1 -TestProductId "..." -RefundOnly
#   .\scripts\run-perf-tests.ps1 -CheckoutOnly
#
# Prereqs: k6 on PATH, Docker Desktop running, SALEOR_ADMIN_EMAIL /
# SALEOR_ADMIN_PASSWORD set as env vars. TEST_PRODUCT_ID is required
# unless -RefundOnly or -CheckoutOnly. TEST_CHECKOUT_VARIANT_ID is
# required unless -VariantOnly — both order-refund.js AND
# checkout-order-flow.js seed orders against this same variant via guest
# checkout (see each file's header comment).

param(
    [string]$TestProductId = $env:TEST_PRODUCT_ID,
    [string]$TestCheckoutVariantId = $env:TEST_CHECKOUT_VARIANT_ID,
    [string]$SaleorApiUrl = "http://localhost:8000/graphql/",
    [switch]$VariantOnly,
    [switch]$RefundOnly,
    [switch]$CheckoutOnly
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

if (-not (Test-Path "reports")) {
    New-Item -ItemType Directory -Path "reports" | Out-Null
}

# --- 1. Bring up the perf stack if needed ---------------------------------
Write-Host "Checking perf stack..." -ForegroundColor Cyan
docker compose -f docker-compose.perf.yml up -d

Write-Host "Waiting for InfluxDB..." -ForegroundColor Cyan
$ready = $false
for ($i = 1; $i -le 15; $i++) {
    try {
        Invoke-WebRequest -Uri "http://localhost:8086/ping" -UseBasicParsing -TimeoutSec 3 | Out-Null
        $ready = $true
        break
    } catch {
        Start-Sleep -Seconds 2
    }
}
if (-not $ready) {
    Write-Host "InfluxDB did not come up - check 'docker compose -f docker-compose.perf.yml logs influxdb'" -ForegroundColor Red
    exit 1
}

# --- 2. Resolve which scenarios this run actually executes -----------------
# Each -XOnly switch means "run just that one" — so it implies skipping
# the other two, not just the switch's own opposite number.
$runVariant  = -not $RefundOnly -and -not $CheckoutOnly
$runRefund   = -not $VariantOnly -and -not $CheckoutOnly
$runCheckout = -not $VariantOnly -and -not $RefundOnly

# --- 3. Validate required inputs ------------------------------------------
if (-not $env:SALEOR_ADMIN_EMAIL -or -not $env:SALEOR_ADMIN_PASSWORD) {
    Write-Host "SALEOR_ADMIN_EMAIL / SALEOR_ADMIN_PASSWORD env vars are required." -ForegroundColor Red
    exit 1
}
if ($runVariant -and -not $TestProductId) {
    Write-Host "TEST_PRODUCT_ID is required for the variant-creation scenario (pass -TestProductId or set TEST_PRODUCT_ID)." -ForegroundColor Red
    exit 1
}
if (($runRefund -or $runCheckout) -and -not $TestCheckoutVariantId) {
    Write-Host "TEST_CHECKOUT_VARIANT_ID is required for the order-refund and checkout-order-flow scenarios (pass -TestCheckoutVariantId or set TEST_CHECKOUT_VARIANT_ID)." -ForegroundColor Red
    exit 1
}

# --- 4. Run scenarios -------------------------------------------------------
$runStart = Get-Date

if ($runVariant) {
    Write-Host "`nRunning: product-variant-creation" -ForegroundColor Green
    k6 run tests/k6/scenarios/product-variant-creation.js `
        --out influxdb=http://localhost:8086/k6 `
        -e SALEOR_API_URL=$SaleorApiUrl `
        -e SALEOR_ADMIN_EMAIL=$env:SALEOR_ADMIN_EMAIL `
        -e SALEOR_ADMIN_PASSWORD=$env:SALEOR_ADMIN_PASSWORD `
        -e TEST_PRODUCT_ID=$TestProductId
}

if ($runRefund) {
    Write-Host "`nRunning: order-refund" -ForegroundColor Green
    k6 run tests/k6/scenarios/order-refund.js `
        --out influxdb=http://localhost:8086/k6 `
        -e SALEOR_API_URL=$SaleorApiUrl `
        -e SALEOR_ADMIN_EMAIL=$env:SALEOR_ADMIN_EMAIL `
        -e SALEOR_ADMIN_PASSWORD=$env:SALEOR_ADMIN_PASSWORD `
        -e TEST_CHECKOUT_VARIANT_ID=$TestCheckoutVariantId
}

if ($runCheckout) {
    Write-Host "`nRunning: checkout-order-flow" -ForegroundColor Green
    k6 run tests/k6/scenarios/checkout-order-flow.js `
        --out influxdb=http://localhost:8086/k6 `
        -e SALEOR_API_URL=$SaleorApiUrl `
        -e TEST_CHECKOUT_VARIANT_ID=$TestCheckoutVariantId
}

# --- 5. Open results --------------------------------------------------------
Write-Host "`nOpening Grafana dashboard + this run's HTML report(s)..." -ForegroundColor Cyan
Start-Process "http://localhost:3000/d/saleor-k6-perf"

Get-ChildItem "reports" -Filter "*.html" |
    Where-Object { $_.LastWriteTime -ge $runStart } |
    Sort-Object LastWriteTime -Descending |
    ForEach-Object { Start-Process $_.FullName }
