# Support assistant project - summary

Short version:
- Built and tested a policy-grounded customer-support assistant on a self-hosted Saleor store (Node, Gemini / Ollama / stub providers). It answers from the store policy and verified order data, labels every reply (answerable, not covered, conflict, ambiguous, off-topic) and never invents rules.
- Designed the evaluation: a human-labelled question set scored by exact label match, with separate off-topic and prompt-injection/leakage sets. Measured run-to-run noise (about 2 cases of 58), compared prompt versions with repeats and a ship rule fixed in advance, and kept each version as a git tag.
- Wired it into Jenkins: stub-provider Playwright and k6 tests on every build (0 model requests), plus an optional real-model gate (58 + 12 + 12 requests) with explicit thresholds.
- Hardened the service: input limits, schema-checked replies, a fixed reply for off-topic messages, a bounded retry on Gemini 429/503, and security tests for injection strings, secret leakage and error-body content.
- Reported what the tests found, including an instruction-following gap (the model appends a requested word) and a high rate of answering questions it should hold back on.

Numbers to quote (prompt v2.4, 2026-10-25): gate 47/58 (baseline 44/58), development split 50/60, test split 31/38, off-topic 12/12, injection set 11/12.

Stack: Node.js, Playwright, Python (evaluation harness), Jenkins, Docker Compose, k6, InfluxDB, Grafana, OWASP ZAP, Saleor GraphQL.