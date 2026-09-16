# Saleor E2E Automation — Test Plan (Phase 1: GraphQL API)

## Scope

Self-hosted Saleor 3.23 (`saleor.solception.com` / `saleor-dashboard.solception.com`),
API + Dashboard only — no storefront deployed in this phase.

This plan covers the **GraphQL API layer** first, per the priority order agreed for
this project: API → DB assertions → Dashboard UI → contract/visual/load/security →
CI/CD. Dashboard UI testing gets its own TEST_PLAN section once this phase is stable.

## Environment

| Item | Value |
|---|---|
| API endpoint | `https://saleor.solception.com/graphql/` |
| Dashboard | `https://saleor-dashboard.solception.com/` |
| Staff account | created via `manage.py createsuperuser` |
| Seed data | `manage.py populatedb` (default channel, sample products/categories) |
| DB (ground truth) | `postgres://saleor:saleor@127.0.0.1:5433/saleor` (container port remapped — see `/opt/saleor/docker-compose.yml`) |
| Email capture | Mailpit UI, `127.0.0.1:8025` (SSH tunnel to view) |

## Tooling

- Playwright `APIRequestContext` via `utils/graphql-client.js` — no Apollo Client
- `pg` for direct DB ground-truth assertions (same pattern as Medusa)
- AJV, Pact, k6, ZAP, Jenkins/Allure — added in later phases, not this one

## Pre-work (do before writing test cases below)

- [ ] Confirm `pg` can connect to `127.0.0.1:5433` from Node (quick throwaway script — don't build assertion helpers on an unverified connection)
- [ ] Run `tokenCreate` manually in GraphQL Playground with the staff account to confirm the exact mutation shape/field names before coding the auth helper
- [ ] Skim the schema for `checkoutCreate`, `accountRegister`, and `webhookCreate` in Playground's schema explorer — confirms field names before committing test code to them

## Test Categories (priority order)

### 1. Public / unauthenticated queries — foundational
- `shop` query (name, domain, description) — smoke test already passing
- `products` listing (pagination, filtering by channel)
- `categories` / `collections` listing
- `channels` — confirm default channel slug/currency match `populatedb` seed

### 2. Authentication
- `tokenCreate` — valid staff credentials → token issued
- `tokenCreate` — invalid credentials → correct error, no token
- Authenticated query using `Authorization: Bearer` header
- Expired/malformed token → correct rejection (not a 500)
- `tokenRefresh` flow

### 3. Authenticated / permission-gated queries
- Staff-only fields (e.g. `order` details, `customer` PII) rejected without auth
- Same fields succeed with a token that has the right permission group
- A token from a *lower-permission* staff account correctly denied — this is the RBAC challenge flagged in the original project scoping, worth deliberate coverage here rather than assuming it works

### 4. Mutations — catalog
- `productCreate` / `productUpdate` / `productDelete`
- `categoryCreate`
- Channel-specific pricing (`productChannelListingUpdate`) — same product, different price per channel, per Saleor's multichannel model

### 5. Mutations — checkout / order
- `checkoutCreate` → `checkoutLinesAdd` → `checkoutComplete` happy path
- Invalid checkout state transitions (e.g. completing an empty checkout)
- Address validation on checkout

### 6. Mutations — customer account
- `accountRegister` (two-step: create + confirm, matches the Medusa pattern you've seen before)
- Password reset — verify email arrives in Mailpit rather than asserting on the mutation response alone
- Duplicate email registration → correct error

### 7. Database ground-truth assertions
- Ground-truth-first pattern (as with Medusa): create/mutate via API, verify the row exists correctly in Postgres before trusting the API's own response as truth
- Start with `productCreate` and `checkoutComplete` — highest-value places to catch API/DB drift

### 8. Negative / error-handling testing
- Malformed GraphQL syntax → clean error, not a stack trace leak
- Oversized/invalid variables
- Rate-limit or depth-limit behavior if Saleor enforces query complexity limits (check schema/docs — untested assumption right now)

### 9. Webhooks — stretch goal, not blocking phases 1–8
- `webhookCreate` against a test endpoint (could point at Mailpit or a small throwaway listener)
- Async delivery verification — this is the one genuinely new async-testing pattern flagged in original project scoping; expect it to take real exploration time, don't underestimate it

## Explicitly out of scope for this phase

- Storefront testing (no storefront deployed — deferred)
- Dashboard UI testing (separate TEST_PLAN section, after this phase is stable)
- Pact, AJV, visual regression, k6, ZAP, Jenkins wiring (later phases)

## Known risks / open questions

- `RSA_PRIVATE_KEY` isn't set — Saleor auto-generates a temporary JWT signing key on every container restart, which invalidates active sessions/tokens. If auth tests start failing intermittently after a container restart, this is why — not a test bug.
- Query complexity/depth limiting behavior is unconfirmed — worth checking before writing negative tests that assume a specific limit.
