'use strict';
// SCRUM-15: response-contract tests. Tag: @contract  ->  npx playwright test --project=api --grep @contract
const { test } = require('../../fixtures/auth'); // your fixture file: provides worker-scoped `staffToken`
const { expect } = require('@playwright/test');
require('../../utils/schema-matchers');
const { validate } = require('../../utils/schema-validator');

const API = process.env.SALEOR_GRAPHQL_URL || 'http://localhost:8000/graphql/';

async function gql(request, query, variables = {}, token) {
  const res = await request.post(API, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    data: { query, variables },
  });
  const type = res.headers()['content-type'] || '';
  const text = await res.text();
  expect(type, `POST ${API} -> ${res.status()}, body starts: ${text.slice(0, 80)}`).toContain('application/json');
  return JSON.parse(text);
}

test.describe('@contract GraphQL response contracts', () => {
  test('shop query matches contract', async ({ request }) => {
    const body = await gql(request, '{ shop { name domain { host } } }');
    expect(body).toMatchSchema('shop');
  });

  test('channels query matches contract (staff)', async ({ request, staffToken }) => {
    const body = await gql(request, '{ channels { id name slug isActive currencyCode } }', {}, staffToken);
    expect(body).toMatchSchema('channels');
  });

  test('products connection matches contract', async ({ request }) => {
    const q = `query($ch:String){ products(first:5, channel:$ch){ totalCount
      pageInfo{hasNextPage hasPreviousPage startCursor endCursor}
      edges{ cursor node{ id name } } } }`;
    const body = await gql(request, q, { ch: 'default-channel' });
    expect(body).toMatchSchema('productsPage');
  });

  // Keep login calls minimal: they share Saleor's per-account throttle with every other worker.
  test('tokenCreate failure uses a throwaway email (never the admin account)', async ({ request }) => {
    const q = `mutation($e:String!,$p:String!){ tokenCreate(email:$e,password:$p){
      token refreshToken user{id email isStaff} errors{field message code} } }`;
    const body = await gql(request, q, { e: `contract-${Date.now()}@nowhere.test`, p: 'wrong-password' });
    expect(body).toMatchSchema('tokenCreate');
    expect(body.data.tokenCreate.token).toBeNull();
  });

  test('unauthenticated staff query returns a GraphQL error envelope', async ({ request }) => {
    const body = await gql(request, '{ channels { id } }');
    expect(body).toMatchSchema('graphqlFailure');
  });
});

// Offline self-tests: prove the schemas actually reject bad data (no server needed).
test.describe('@contract validator self-test', () => {
  const jwt = 'aaa.bbb.ccc';
  const order = () => ({ checkoutComplete: { order: {
    id: 'T3JkZXI6MDc1', number: '2760', status: 'UNFULFILLED', chargeStatus: 'FULL', isPaid: true,
    created: '2026-09-29T08:36:02.662501+00:00',
    total: { currency: 'USD', gross: { currency: 'USD', amount: 85.42 } } },
    confirmationNeeded: false, errors: [] } });

  test('accepts a known-good order payload', () => {
    expect(validate('checkoutComplete', order(), { dataOnly: true }).valid).toBe(true);
  });
  test('rejects money amount sent as string', () => {
    const p = order(); p.checkoutComplete.order.total.gross.amount = '85.42';
    expect(validate('checkoutComplete', p, { dataOnly: true }).valid).toBe(false);
  });
  test('rejects unknown enum value', () => {
    const p = order(); p.checkoutComplete.order.status = 'WEIRD';
    expect(validate('checkoutComplete', p, { dataOnly: true }).valid).toBe(false);
  });
  test('rejects unexpected extra field', () => {
    const p = order(); p.checkoutComplete.order.surprise = 1;
    expect(validate('checkoutComplete', p, { dataOnly: true }).valid).toBe(false);
  });
  test('rejects tokenCreate success with null token', () => {
    const p = { data: { tokenCreate: { token: null, refreshToken: null, user: null, errors: [] } } };
    expect(validate('tokenCreate', p).valid).toBe(false);
  });
  test('rejects data + top-level errors together', () => {
    const p = { data: { shop: { name: 'x', domain: { host: 'h' } } }, errors: [{ message: 'm' }] };
    expect(validate('shop', p).valid).toBe(false);
  });
  test('accepts tokenCreate success', () => {
    const p = { data: { tokenCreate: { token: jwt, refreshToken: jwt,
      user: { id: 'VXNlcjox', email: 'a@b.com', isStaff: true }, errors: [] } } };
    expect(validate('tokenCreate', p).valid).toBe(true);
  });
});
