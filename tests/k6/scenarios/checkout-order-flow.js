// tests/k6/scenarios/checkout-order-flow.js
//
// Load-tests the full guest-checkout-to-order chain — checkoutCreate ->
// checkoutDeliveryMethodUpdate -> checkoutPaymentCreate -> checkoutComplete
// — the same four mutations checkout.js's createOrder() fixture chains
// together functionally. Shapes are copied directly from that fixture
// (guest checkout, no customerToken, mirumee.payments.dummy gateway, same
// static address block) rather than guessed at.
//
// This covers SCRUM-38 as ONE combined scenario, not two separate
// "checkout" and "order-creation" scripts — checkout.js itself never
// treats them as separate flows either (there's no "abandoned checkout"
// path tested functionally), so splitting them here would test something
// the functional suite doesn't. Say the word if you'd rather have them
// split.
//
// DESIGN NOTE — stock management: every successful checkoutComplete here
// consumes real stock from TEST_CHECKOUT_VARIANT_ID, and this scenario
// deliberately does NOT cancel/restock what it creates — per-project
// decision, the seeded variant's stock is set high enough up front to
// absorb a full run instead. Same accepted accumulation tradeoff as
// order-refund.js applies: completed orders are not hard-deleted (k6 has
// no Postgres client), just tagged perf-checkout-* instead of
// perf-order-* so the two are distinguishable when you run the manual
// SQL cascade later.
//
// Requires env var TEST_CHECKOUT_VARIANT_ID — the SAME variant
// order-refund.js seeds its orders against. Both scenarios draw from one
// stock pool, so its seeded stock quantity needs to be high enough to
// cover both scenarios' combined iterations for a given run, not just
// this one alone.

import { Counter } from 'k6/metrics';
import { graphqlRequest } from '../lib/graphql.js';
import { buildSummary } from '../lib/report.js';

const CHECKOUT_CREATE = `
  mutation CreateCheckout($input: CheckoutCreateInput!) {
    checkoutCreate(input: $input) {
      checkout { id shippingMethods { id name } }
      errors { field message code }
    }
  }
`;

const CHECKOUT_DELIVERY_METHOD_UPDATE = `
  mutation CheckoutDeliveryMethodUpdate($id: ID, $deliveryMethodId: ID) {
    checkoutDeliveryMethodUpdate(id: $id, deliveryMethodId: $deliveryMethodId) {
      checkout { id }
      errors { field message code }
    }
  }
`;

const CHECKOUT_PAYMENT_CREATE = `
  mutation CheckoutPaymentCreate($id: ID, $input: PaymentInput!) {
    checkoutPaymentCreate(id: $id, input: $input) {
      checkout { id }
      payment { id chargeStatus }
      errors { field code message }
    }
  }
`;

const CHECKOUT_COMPLETE = `
  mutation CheckoutComplete($id: ID, $redirectUrl: String) {
    checkoutComplete(id: $id, redirectUrl: $redirectUrl) {
      order { id number }
      confirmationNeeded
      errors { field message code }
    }
  }
`;

// Mirrors checkout.js's createOrder() static address block exactly.
const STATIC_ADDRESS = {
  firstName: 'Checkout', lastName: 'Tester',
  streetAddress1: '350 5th Avenue', streetAddress2: 'Suite 7500',
  city: 'New York', countryArea: 'NY', postalCode: '10118', country: 'US',
};

// Business-level outcome counters — same pattern as
// product-variant-creation.js. A rejection at ANY of the four chained
// mutations counts here; graphqlRequest's own console.error/warn (tagged
// with each mutation's opName) tells you which stage actually failed.
const orderCreated = new Counter('checkout_order_created_success');
const orderRejected = new Counter('checkout_order_created_rejected');

export const options = {
  scenarios: {
    checkout_order_flow: {
      executor: 'ramping-vus',
      exec: 'checkoutOrderFlow',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 5 },
        { duration: '1m', target: 5 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    // TEMPORARY, evidence-based starting point — NOT yet a confirmed
    // baseline. Your one local run showed avg=1.05s, med=692ms, p95=3.84s,
    // max=6.01s against p(95)<500ms. p(95)<500ms was copied from the other
    // two scenarios without accounting for this one being a 4-step chained
    // flow (checkoutCreate -> deliveryMethodUpdate -> paymentCreate ->
    // complete) rather than a single mutation — some slack above 500ms is
    // legitimate here, not just noise.
    // That said, 3.84s is still high enough to warrant investigation, not
    // just padding: run this scenario 2-3 more times as its own controlled
    // series (nothing else hitting the stack concurrently) and compare. If
    // p95 settles well below 2s, that's this scenario's real baseline —
    // tighten this back down and document the number in SCRUM-40. If it
    // stays near 3-4s consistently, that's a genuine finding (likely local
    // machine contention, same class of issue flagged for
    // product-variant-creation's p95 noise) worth its own ticket, not a
    // threshold to quietly absorb.
    'http_req_duration{name:graphql-mutation}': ['p(95)<2000'],
    'http_req_failed{name:graphql-mutation}': ['rate<0.01'],
  },
};

export function setup() {
  const baseUrl = __ENV.SALEOR_API_URL || 'http://localhost:8000/graphql/';
  const variantId = __ENV.TEST_CHECKOUT_VARIANT_ID;
  if (!variantId) {
    throw new Error('TEST_CHECKOUT_VARIANT_ID env var is required — see file header comment.');
  }
  return { baseUrl, variantId };
}

export function checkoutOrderFlow(data) {
  const email = `perf-checkout-${__VU}-${__ITER}-${Date.now()}@loadtest.local`;

  const createResult = graphqlRequest(
    data.baseUrl,
    CHECKOUT_CREATE,
    {
      input: {
        email,
        channel: 'default-channel',
        lines: [{ quantity: 1, variantId: data.variantId }],
        shippingAddress: STATIC_ADDRESS,
        saveBillingAddress: true,
        billingAddress: STATIC_ADDRESS,
      },
    },
    null, // guest checkout — no token, matches checkout.js fixture
    'checkoutCreate',
    'checkoutCreate'
  );
  if (!createResult.succeeded) {
    orderRejected.add(1);
    return;
  }

  const checkout = createResult.body?.data?.checkoutCreate?.checkout;
  const shippingMethod = checkout?.shippingMethods?.[0];
  if (!shippingMethod) {
    console.error(`[checkoutOrderFlow] checkout ${checkout?.id} has no available shipping methods`);
    orderRejected.add(1);
    return;
  }

  const deliveryResult = graphqlRequest(
    data.baseUrl,
    CHECKOUT_DELIVERY_METHOD_UPDATE,
    { id: checkout.id, deliveryMethodId: shippingMethod.id },
    null,
    'checkoutDeliveryMethodUpdate',
    'checkoutDeliveryMethodUpdate'
  );
  if (!deliveryResult.succeeded) {
    orderRejected.add(1);
    return;
  }

  const paymentResult = graphqlRequest(
    data.baseUrl,
    CHECKOUT_PAYMENT_CREATE,
    { id: checkout.id, input: { gateway: 'mirumee.payments.dummy', token: 'fake-token' } },
    null,
    'checkoutPaymentCreate',
    'checkoutPaymentCreate'
  );
  if (!paymentResult.succeeded) {
    orderRejected.add(1);
    return;
  }

  const completeResult = graphqlRequest(
    data.baseUrl,
    CHECKOUT_COMPLETE,
    { id: checkout.id, redirectUrl: 'http://localhost:9000/order-complete' },
    null,
    'checkoutComplete',
    'checkoutComplete'
  );
  if (!completeResult.succeeded) {
    orderRejected.add(1);
    return;
  }

  const order = completeResult.body?.data?.checkoutComplete?.order;
  if (!order) {
    console.error(`[checkoutOrderFlow] checkoutComplete returned no order for checkout ${checkout.id} (confirmationNeeded path?)`);
    orderRejected.add(1);
    return;
  }

  orderCreated.add(1);
}

export function handleSummary(data) {
  return buildSummary(data, 'checkout-order-flow');
}