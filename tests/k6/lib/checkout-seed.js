// tests/k6/lib/checkout-seed.js
//
// Seeds one fully-paid order via a guest checkout, so order-refund.js has
// its own dedicated pool instead of querying for "any paid order in the
// system" — which is what previously swept up checkout.spec.js's orphaned
// orders (that spec creates orders with no teardown, unlike the checkout.js
// fixture, which cancels + hard-deletes everything it creates by exact ID).
//
// Every order this seeds uses an email under perf-order-*@loadtest.local —
// distinct from checkout.spec.js's fixed test-user-274356@tester.com and
// from checkout.js fixture's own emails — so these are always identifiable
// and never collide with functional test data again.
//
// Mutation shapes below are copied directly from checkout.js's proven
// createOrder() flow (guest checkout — no customerToken, matching that
// fixture's own reasoning: keeps order.userEmail as the single source of
// truth). total{gross{amount}} is added to checkoutComplete's selection
// beyond what checkout.js requests, since we need the amount for refunding —
// confirmed valid by checkout.spec.js's own checkoutComplete query, which
// requests the same field.
//
// Requires env var TEST_CHECKOUT_VARIANT_ID — a variant with stock and a
// default-channel price, safe to sell against repeatedly. Each seed call
// consumes one unit of real stock; see README for a reset note if you run
// this enough times to exhaust it.

import { graphqlRequest } from './graphql.js';

const ADDRESS = {
  firstName: 'Perf',
  lastName: 'Tester',
  streetAddress1: '350 5th Avenue',
  streetAddress2: 'Suite 7500',
  city: 'New York',
  countryArea: 'NY',
  postalCode: '10118',
  country: 'US',
};

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
      order { id isPaid status total { gross { amount } } }
      confirmationNeeded
      errors { field message code }
    }
  }
`;

// Returns { id, amount } on success, or null (with a logged reason) on
// failure. Callers should filter out nulls rather than abort the whole
// pool over one bad seed — stock exhaustion or a transient error on
// order N shouldn't cost you orders 1..N-1.
export function seedOrder(baseUrl, variantId, index) {
  const email = `perf-order-${index}-${Date.now()}@loadtest.local`;

  const createRes = graphqlRequest(
    baseUrl,
    CHECKOUT_CREATE,
    {
      input: {
        email,
        channel: 'default-channel',
        lines: [{ quantity: 1, variantId }],
        shippingAddress: ADDRESS,
        saveBillingAddress: true,
        billingAddress: ADDRESS,
      },
    },
    null, // guest checkout — no token, matching checkout.js fixture
    'checkoutCreate-seed',
    'checkoutCreate',
    'graphql-setup'
  );
  if (!createRes.succeeded) return null;

  const checkout = createRes.body.data.checkoutCreate.checkout;
  const shippingMethodId = checkout?.shippingMethods?.[0]?.id;
  if (!shippingMethodId) {
    console.warn(`[seedOrder ${index}] no shipping methods available for this channel/address`);
    return null;
  }

  const deliveryRes = graphqlRequest(
    baseUrl,
    CHECKOUT_DELIVERY_METHOD_UPDATE,
    { id: checkout.id, deliveryMethodId: shippingMethodId },
    null,
    'checkoutDeliveryMethodUpdate-seed',
    'checkoutDeliveryMethodUpdate',
    'graphql-setup'
  );
  if (!deliveryRes.succeeded) return null;

  const paymentRes = graphqlRequest(
    baseUrl,
    CHECKOUT_PAYMENT_CREATE,
    { id: checkout.id, input: { gateway: 'mirumee.payments.dummy', token: 'fake-token' } },
    null,
    'checkoutPaymentCreate-seed',
    'checkoutPaymentCreate',
    'graphql-setup'
  );
  if (!paymentRes.succeeded) return null;

  const completeRes = graphqlRequest(
    baseUrl,
    CHECKOUT_COMPLETE,
    { id: checkout.id, redirectUrl: 'http://localhost:9000/order-complete' },
    null,
    'checkoutComplete-seed',
    'checkoutComplete',
    'graphql-setup'
  );
  if (!completeRes.succeeded) return null;

  const order = completeRes.body.data.checkoutComplete.order;
  if (!order || !order.isPaid) {
    console.warn(`[seedOrder ${index}] completed but isPaid=false: ${JSON.stringify(order)}`);
    return null;
  }

  return { id: order.id, amount: order.total.gross.amount };
}
