# Saleor E2E Automation

QA automation suite for a self-hosted Saleor instance (GraphQL API, Dashboard, database assertions, contract, performance and security checks), plus a tested customer-support assistant ("Tulip & Teak") that answers store-policy and order questions.

## What is in the repo

| Area | Where | Tooling |
|---|---|---|
| GraphQL API tests | tests/api | Playwright APIRequestContext, pg ground-truth assertions, AJV schema validation |
| Dashboard UI tests | page-objects/, Playwright `ui` project | Playwright |
| Support assistant | assistant/ | Node (no framework), Gemini / Ollama / stub providers |
| Assistant tests | tests/chat | Playwright (stub provider), k6 chat-flow |
| Performance | tests/k6/scenarios | k6, InfluxDB, Grafana |
| Security | Jenkins ZAP stage, tests/chat/chat-security.spec.js | OWASP ZAP, Playwright |
| CI | Jenkinsfile | Jenkins, Docker Compose |

Test plan: [TEST_PLAN_SALEOR.md](TEST_PLAN_SALEOR.md). Older notes: [docs/SCRUM-15-kit.md](docs/SCRUM-15-kit.md). Project summary: [docs/PROJECT_SUMMARY.md](docs/PROJECT_SUMMARY.md).
Evaluation harness (policy-grounded LLM evals, public): [llm-policy-eval-harness](https://github.com/stealthy1992/llm-policy-eval-harness).

## Quick start

~~~
npm ci
npx playwright install
npm run test:api
~~~

The Saleor stack runs from `saleor-platform/` (Docker Compose). Settings are read from environment variables or a `.env` file in the repo root.

## Support assistant

`npm run assistant` starts an HTTP server (default port 3100) that answers customer questions from the store policy page and, when the customer sends an order number and email, from that one order's verified data in Saleor.

Deterministic stub, no API key:

~~~
$env:LLM_PROVIDER = 'stub'
npm run assistant
~~~

Real model (LLM_PROVIDER defaults to gemini):

~~~
$env:GEMINI_API_KEY = '<key>'
npm run assistant
~~~

| Variable | Default | Purpose |
|---|---|---|
| LLM_PROVIDER | gemini | gemini, ollama or stub |
| LLM_MODEL | per provider | model name |
| GEMINI_API_KEY | none | required for gemini |
| OLLAMA_URL | http://localhost:11434 | ollama server |
| LLM_TEMPERATURE | 0 | sampling temperature |
| LLM_TIMEOUT_MS | 90000 | model call timeout |
| LLM_RETRY_DELAY_MS | 2000 | wait before the single retry on Gemini 429/503 |
| STUB_LATENCY_MS | 0 | artificial stub delay |
| ASSISTANT_PORT | 3100 | listen port |
| POLICY_TTL_MS | 60000 | policy page cache time |
| SALEOR_API_URL | none | Saleor base URL (the assistant appends /graphql/) |
| SALEOR_APP_TOKEN | none | Saleor app token for policy and order reads |

### API

`POST /api/chat` with `{"message": "..."}` (max 1000 characters, body max 10 KB) returns `{"answer": "...", "clauses": ["3.1"], "label": "ANSWERABLE"}`. `GET /health` returns status, provider and model.

Errors are a single code: 400 (bad input), 405, 413, 502 `llm_error`, 502 `invalid_model_reply`, 502 `policy_unavailable`, 502 `order_lookup_unavailable`.

| Label | Meaning |
|---|---|
| ANSWERABLE | the policy answers the question |
| NOT_COVERED | the policy says nothing about it |
| CONFLICT | two clauses contradict and nothing settles it |
| AMBIGUOUS | the wording supports more than one reading |
| OFF_TOPIC | greeting, thanks or unrelated; the customer gets a fixed scope message and the model's own text is discarded |

### Safeguards in the server

- Input limits and JSON validation before anything reaches the model.
- The model must return JSON with an allowed label; anything else is a 502 and the customer sees nothing.
- A strict schema check on every reply.
- The customer email is never put in the prompt, and only the one matching order is loaded.
- One bounded retry on Gemini 429 and 503 only, never on timeouts.

### How it is tested

| Layer | What | Needs |
|---|---|---|
| Stub API tests | CHAT-API-001..004: replies, validation, 413/404/405, OFF_TOPIC | stub assistant on :3100 |
| Security envelope | CHAT-SEC-001..003: injection strings, no key or token patterns in any response, error bodies carry only a code | stub assistant |
| Offline checks | `node assistant/check-retry.js`, `node assistant/check-offtopic.js` | nothing |
| k6 chat-flow | latency and error thresholds against the stub | stub assistant |
| Real-model evaluation | labelled questions scored by exact label match, plus an off-topic set and an injection/leakage set | private harness, optional |

Run the chat tests with the stub assistant running: `npx playwright test --project=chat`. They skip themselves if the server is not on the stub.

### Evaluation gate (optional Jenkins stage)

Tick `RUN_EVAL_GATE` when building to run the real-model gate (about 82 Gemini requests). The harness and answer key are private and are not in this repository. The build goes unstable if:

- the 58-case evaluation scores below 41, or shows any OFF_TOPIC or missing-label flag;
- the off-topic set scores below 11/12;
- the injection set scores below 11/12, leaks prompt text or a key, trips a forbidden-text check, or shows more than 1 `obeyed` flag (the one known finding below).

### Known findings and limitations

- F-1: when a question asks the assistant to end its reply with a given word, it does. Low severity; not fixed.
- The policy page and order data are written by store staff and go into the prompt as text. Customers cannot edit them.
- `/health` shows the provider and model name.
- There is no rate limiting and no retry on Saleor calls.
- Order-flow answers are not scored by the evaluation set.
- On the labelled set the assistant answers about half of the questions it should hold back on (AMBIGUOUS and NOT_COVERED). Fine for a portfolio; a human handoff would be needed before real customers.
- The real-model quota is demo scale (a daily request limit on the lite model).

## CI

The Jenkinsfile brings up the Saleor stack, starts the assistant on the stub, checks policy drift and prompt parity against a private harness (skipped if absent), runs the Playwright suite (api, ui, chat), the throttle tests, schema coverage, k6 scenarios, the optional eval gate, perf-data cleanup and a ZAP API scan.