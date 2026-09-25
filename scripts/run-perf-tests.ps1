# scripts/run-perf-tests.ps1
#
# One-command local run: brings up the InfluxDB+Grafana stack if it's not
# already running, runs both k6 scenarios (writing to InfluxDB for the
# live Grafana dashboard AND to a standalone HTML report per scenario),
# then opens the Grafana dashboard and only the report(s) this run
# actually produced.
#
# Usage:
#   .\scripts\run-perf-tests.ps1
#   .\scripts\run-perf-tests.ps1 -TestProductId "..." -RefundOnly
#
# Prereqs: k6 on PATH, Docker Desktop running, SALEOR_ADMIN_EMAIL /
# SALEOR_ADMIN_PASSWORD set as env vars. TEST_PRODUCT_ID is required
# unless -RefundOnly. TEST_CHECKOUT_VARIANT_ID is required unless
# -VariantOnly (order-refund.js seeds its own orders against this variant
# via guest checkout - see that file's header comment for why).

param(
    [string]$TestProductId = $env:TEST_PRODUCT_ID,
    [string]$TestCheckoutVariantId = $env:TEST_CHECKOUT_VARIANT_ID,
    [string]$SaleorApiUrl = "http://localhost:8000/graphql/",
    [switch]$VariantOnly,
    [switch]$RefundOnly
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

# --- 2. Validate required inputs ------------------------------------------
if (-not $env:SALEOR_ADMIN_EMAIL -or -not $env:SALEOR_ADMIN_PASSWORD) {
    Write-Host "SALEOR_ADMIN_EMAIL / SALEOR_ADMIN_PASSWORD env vars are required." -ForegroundColor Red
    exit 1
}
if (-not $RefundOnly -and -not $TestProductId) {
    Write-Host "TEST_PRODUCT_ID is required for the variant-creation scenario (pass -TestProductId or set TEST_PRODUCT_ID)." -ForegroundColor Red
    exit 1
}
if (-not $VariantOnly -and -not $TestCheckoutVariantId) {
    Write-Host "TEST_CHECKOUT_VARIANT_ID is required for the order-refund scenario (pass -TestCheckoutVariantId or set TEST_CHECKOUT_VARIANT_ID)." -ForegroundColor Red
    exit 1
}

# --- 3. Run scenarios -------------------------------------------------------
$runStart = Get-Date

if (-not $RefundOnly) {
    Write-Host "`nRunning: product-variant-creation" -ForegroundColor Green
    k6 run tests/k6/scenarios/product-variant-creation.js `
        --out influxdb=http://localhost:8086/k6 `
        -e SALEOR_API_URL=$SaleorApiUrl `
        -e SALEOR_ADMIN_EMAIL=$env:SALEOR_ADMIN_EMAIL `
        -e SALEOR_ADMIN_PASSWORD=$env:SALEOR_ADMIN_PASSWORD `
        -e TEST_PRODUCT_ID=$TestProductId
}

if (-not $VariantOnly) {
    Write-Host "`nRunning: order-refund" -ForegroundColor Green
    k6 run tests/k6/scenarios/order-refund.js `
        --out influxdb=http://localhost:8086/k6 `
        -e SALEOR_API_URL=$SaleorApiUrl `
        -e SALEOR_ADMIN_EMAIL=$env:SALEOR_ADMIN_EMAIL `
        -e SALEOR_ADMIN_PASSWORD=$env:SALEOR_ADMIN_PASSWORD `
        -e TEST_CHECKOUT_VARIANT_ID=$TestCheckoutVariantId
}

# --- 4. Open results --------------------------------------------------------
Write-Host "`nOpening Grafana dashboard + this run's HTML report(s)..." -ForegroundColor Cyan
Start-Process "http://localhost:3000/d/saleor-k6-perf"

Get-ChildItem "reports" -Filter "*.html" |
    Where-Object { $_.LastWriteTime -ge $runStart } |
    Sort-Object LastWriteTime -Descending |
    ForEach-Object { Start-Process $_.FullName }
