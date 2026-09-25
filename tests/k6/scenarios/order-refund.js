// tests/k6/scenarios/order-refund.js
//
// Load-tests orderRefund — the GraphQL call behind the Dashboard "Refund"
// action your order.spec.js ORDER-UI-020 exercises functionally, confirmed
// against the legacy dummy-gateway path (payment_payment / payment_transaction,
// charge_status: 'partially-refunded' / 'fully-refunded').
//
// REWRITTEN from an earlier version that queried for "any existing paid
// order" — that approach swept up orders from checkout.spec.js, which
// creates orders via its own manual checkout flow with NO teardown
// (unlike the checkout.js fixture, which cancels + hard-deletes by exact
// ID). Running this repeatedly refunded a growing set of that spec's
// orphaned "Mack Travolta" test orders, visible in the Dashboard as
// dozens of unrelated orders unexpectedly showing "Fully refunded".
//
// This version seeds its OWN pool of orders via guest checkout (see
// lib/checkout-seed.js), each tagged with an email under
// perf-order-*@loadtest.local — never touches or is confusable with any
// order created by Playwright fixtures or specs, now or in the future.
//
// Requires env var TEST_CHECKOUT_VARIANT_ID — a variant with stock and a
// default-channel price, used to seed orders. Optional env var POOL_SIZE
// (default 30) controls how many orders setup() seeds; each seed is 4
// sequential requests, so setup() takes roughly POOL_SIZE * 1-2s and
// consumes that much real stock. Raise setupTimeout below if you increase
// POOL_SIZE significantly.
//
// "Partial" and "complete" refunds are tested as two independent payload
// shapes against fresh orders from the pool, not chained on the same
// order the way ORDER-UI-020 does — chaining would need per-order state
// tracking across iterations for no performance-signal benefit.
//
// NOTE: seeded orders are NOT cleaned up after the run — Saleor has no
// orderDelete for finalized orders (only draftOrderDelete; checkout.js's
// teardown uses a direct SQL hard-delete, which k6 can't do without a
// Postgres-capable extension). They'll accumulate under the
// perf-order-*@loadtest.local pattern, clearly identifiable and separate
// from real data. If this needs periodic cleanup, a small Node script
// reusing checkout.js's hardDeleteOrders() pattern (filtered by that email
// pattern, not by status) would be the natural next step.

import { Counter } from 'k6/metrics';
import { graphqlRequest } from '../lib/graphql.js';
import { authenticate } from '../lib/auth.js';
import { seedOrder } from '../lib/checkout-seed.js';
import { buildSummary } from '../lib/report.js';

const ORDER_REFUND = `
  mutation OrderRefund($order: ID!, $amount: PositiveDecimal!) {
    orderRefund(id: $order, amount: $amount) {
      order { id status }
      errors { field message code }
    }
  }
`;

const refundSucceeded = new Counter('refund_succeeded');
const refundRejected = new Counter('refund_rejected');

export const options = {
  scenarios: {
    order_refund: {
      executor: 'ramping-vus',
      exec: 'orderRefund',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 5 },
        { duration: '1m', target: 5 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    'http_req_duration{name:graphql-mutation}': ['p(95)<500'],
    'http_req_failed{name:graphql-mutation}': ['rate<0.01'],
  },
  setupTimeout: '120s', // seeding ~30 orders x 4 requests each; raise if POOL_SIZE grows
};

export function setup() {
  const baseUrl = __ENV.SALEOR_API_URL || 'http://localhost:8000/graphql/';
  const variantId = __ENV.TEST_CHECKOUT_VARIANT_ID;
  const poolSize = parseInt(__ENV.POOL_SIZE || '30', 10);

  if (!variantId) {
    throw new Error('TEST_CHECKOUT_VARIANT_ID env var is required — see file header comment.');
  }

  const token = authenticate(baseUrl);

  const orders = [];
  for (let i = 0; i < poolSize; i++) {
    const order = seedOrder(baseUrl, variantId, i);
    if (order) orders.push(order);
  }

  console.log(`[setup] seeded ${orders.length}/${poolSize} orders successfully`);

  if (orders.length === 0) {
    throw new Error(
      'No orders could be seeded — check TEST_CHECKOUT_VARIANT_ID has stock and a ' +
      'default-channel price, and that the dummy payment gateway is enabled locally.'
    );
  }

  return { baseUrl, token, orders };
}

export function orderRefund(data) {
  // Round-robin through the seeded pool so concurrent VUs don't collide on
  // the same order. If the pool is exhausted before the run ends, later
  // iterations cycle back — a second "complete" refund attempt on an
  // already-fully-refunded order will correctly get rejected at the
  // business level, which now shows up in refundRejected instead of being
  // silently miscounted as a pass.
  const order = data.orders[__ITER % data.orders.length];
  const isPartial = __ITER % 3 !== 0; // roughly 2/3 partial, 1/3 complete refunds
  const amount = isPartial ? (parseFloat(order.amount) * 0.5).toFixed(2) : order.amount;

  const result = graphqlRequest(
    data.baseUrl,
    ORDER_REFUND,
    { order: order.id, amount },
    data.token,
    'orderRefund',
    'orderRefund'
  );

  if (result.succeeded) {
    refundSucceeded.add(1);
  } else {
    refundRejected.add(1);
  }
}

export function handleSummary(data) {
  return buildSummary(data, 'order-refund');
}
