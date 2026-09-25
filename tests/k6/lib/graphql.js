// tests/k6/lib/graphql.js
//
// Thin wrapper around k6's http module for GraphQL calls against the
// Saleor API.
//
// TWO layers of failure Saleor's API can return, and this checks both:
//   1. Transport/schema-level: HTTP non-200, or a top-level `errors` array
//      (malformed query, unknown field, auth failure).
//   2. Business-level: HTTP 200, no top-level `errors`, but the mutation's
//      OWN payload has a populated `errors` array (e.g.
//      data.orderRefund.errors) — this is how every fixture in this repo
//      (product.js, checkout.js, catalog.spec.js) checks for success:
//      `if (data.X.errors.length) throw ...`. A check that only looked at
//      the top level would silently count a rejected mutation as a pass.
// Pass `rootField` (the mutation's root field name, e.g. 'orderRefund') to
// get business-level checking; omit it to only check the transport level
// (used for one-off queries with no mutation payload to inspect).

import http from 'k6/http';
import { check } from 'k6';

// tagName lets setup()/seeding traffic (checkoutCreate, tokenCreate, etc.)
// be excluded from the load-test's own thresholds and Grafana panels —
// both are scoped to name:'graphql-mutation' — so one-time setup cost
// never distorts the SLA being measured. Pass 'graphql-setup' for any
// call made outside the actual scenario exec function.
export function graphqlRequest(baseUrl, query, variables, token, opName, rootField, tagName) {
  const payload = JSON.stringify({ query, variables });
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = http.post(baseUrl, payload, {
    headers,
    tags: { name: tagName || 'graphql-mutation', operation: opName || 'unknown' },
  });

  let body = null;
  try {
    body = res.json();
  } catch (e) {
    body = null;
  }

  const transportOk = check(res, {
    'status is 200': (r) => r.status === 200,
    'response is valid JSON': () => body !== null,
    'no top-level GraphQL errors': () => body !== null && !body.errors,
  });

  if (!transportOk) {
    console.error(`[${opName}] transport/schema-level failure: ${res.status} ${res.body}`);
    return { res, body, businessErrors: null, succeeded: false };
  }

  let businessErrors = [];
  let businessOk = true;
  if (rootField) {
    const payloadField = body?.data?.[rootField];
    businessErrors = payloadField?.errors || [];
    businessOk = check(null, {
      [`${opName}: no business-level errors`]: () => businessErrors.length === 0,
    });
    if (!businessOk) {
      console.warn(`[${opName}] business-level rejection: ${JSON.stringify(businessErrors)}`);
    }
  }

  return { res, body, businessErrors, succeeded: businessOk };
}
