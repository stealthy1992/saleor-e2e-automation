// tests/k6/scenarios/product-variant-creation.js
//
// Load-tests the productVariantCreate mutation — the GraphQL call behind
// the "add variant" action your products.spec.js exercises functionally.
//
// `attributes: []` is confirmed valid by product.js's own productVariant
// fixture, which creates a variant the same way with an empty attributes
// array against your product types. If TEST_PRODUCT_ID points at a
// product type with mandatory variant-selection attributes, the
// variantRejected counter below (and the printed business-error reason)
// will tell you immediately — no more guessing after the fact.
//
// Requires env var TEST_PRODUCT_ID — a dedicated product (not used by
// functional Playwright tests) reserved for perf runs, so load-generated
// variants don't collide with or pollute your e2e fixtures. Seed it once
// manually or via a setup script; don't reuse a product your Playwright
// suite also mutates.

import { Counter } from 'k6/metrics';
import { graphqlRequest } from '../lib/graphql.js';
import { authenticate } from '../lib/auth.js';
import { buildSummary } from '../lib/report.js';

const PRODUCT_VARIANT_CREATE = `
  mutation ProductVariantCreate($input: ProductVariantCreateInput!) {
    productVariantCreate(input: $input) {
      productVariant { id sku }
      errors { field message code }
    }
  }
`;

const PRODUCT_VARIANT_BULK_DELETE = `
  mutation ProductVariantBulkDelete($ids: [ID!]!) {
    productVariantBulkDelete(ids: $ids) {
      count
      errors { field message }
    }
  }
`;

// Business-level outcome counters — distinct from k6's built-in
// http_req_failed (which only flags transport/HTTP failures). A mutation
// that returns HTTP 200 with a populated payload `errors` array is a
// REJECTION, not a transport failure, and needs its own count to be
// visible at all.
const variantCreated = new Counter('variant_created_success');
const variantRejected = new Counter('variant_created_rejected');

export const options = {
  scenarios: {
    product_variant_creation: {
      executor: 'ramping-vus',
      exec: 'productVariantCreation',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 5 },
        { duration: '1m', target: 5 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    // Scoped to name:'graphql-mutation' so setup()'s one-time auth call
    // (tagged 'graphql-setup') never counts toward this SLA.
    'http_req_duration{name:graphql-mutation}': ['p(95)<500'],
    'http_req_failed{name:graphql-mutation}': ['rate<0.01'],
  },
};

export function setup() {
  const baseUrl = __ENV.SALEOR_API_URL || 'http://localhost:8000/graphql/';
  const productId = __ENV.TEST_PRODUCT_ID;
  if (!productId) {
    throw new Error('TEST_PRODUCT_ID env var is required — see file header comment.');
  }
  const token = authenticate(baseUrl);
  return { baseUrl, token, productId, createdVariantIds: [] };
}

export function productVariantCreation(data) {
  const sku = `perf-variant-${__VU}-${__ITER}-${Date.now()}`;

  const result = graphqlRequest(
    data.baseUrl,
    PRODUCT_VARIANT_CREATE,
    {
      input: {
        product: data.productId,
        sku,
        attributes: [], // confirmed valid — see file header comment
        stocks: [],
        trackInventory: true,
      },
    },
    data.token,
    'productVariantCreate',
    'productVariantCreate'
  );

  if (result.succeeded) {
    variantCreated.add(1);
    const variantId = result.body?.data?.productVariantCreate?.productVariant?.id;
    if (variantId) {
      data.createdVariantIds.push(variantId);
    }
  } else {
    variantRejected.add(1);
  }
}

export function teardown(data) {
  // Only ever contains IDs from mutations that actually succeeded, so this
  // never attempts to delete something that was rejected and doesn't exist.
  if (!data.createdVariantIds || data.createdVariantIds.length === 0) return;

  // Saleor's bulk mutations reject the ENTIRE call, all-or-nothing, once a
  // batch exceeds its configured size cap — a run producing more variants
  // than that cap would silently leave every one of them undeleted. Chunk
  // into batches of 50 and check/log each one explicitly, instead of
  // firing a single unchecked call and hoping.
  const BATCH_SIZE = 50;
  let deletedCount = 0;
  let failedBatches = 0;

  for (let i = 0; i < data.createdVariantIds.length; i += BATCH_SIZE) {
    const batch = data.createdVariantIds.slice(i, i + BATCH_SIZE);
    const result = graphqlRequest(
      data.baseUrl,
      PRODUCT_VARIANT_BULK_DELETE,
      { ids: batch },
      data.token,
      'productVariantBulkDelete-teardown',
      'productVariantBulkDelete',
      'graphql-setup'
    );

    if (result.succeeded) {
      deletedCount += result.body?.data?.productVariantBulkDelete?.count ?? batch.length;
    } else {
      failedBatches++;
      console.error(
        `[teardown] batch delete failed for ${batch.length} variant(s) (batch starting at index ${i}): ` +
        JSON.stringify(result.businessErrors || result.body)
      );
    }
  }

  console.log(
    `[teardown] deleted ${deletedCount}/${data.createdVariantIds.length} variants` +
    (failedBatches ? ` — ${failedBatches} batch(es) FAILED, see errors above` : '')
  );
}

export function handleSummary(data) {
  return buildSummary(data, 'product-variant-creation');
}