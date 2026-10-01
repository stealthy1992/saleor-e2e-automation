'use strict';
// Offline tests for the introspection-driven response validator (no Saleor needed).
const { test, expect } = require('@playwright/test');
const { buildSchema } = require('graphql');
const { validateResponse, SchemaValidationError, _setSchemaForTests } = require('../../utils/response-validator');

test.describe('@contract response-validator (generated from introspection)', () => {
  test.beforeAll(() => {
    _setSchemaForTests(buildSchema(`
      scalar DateTime
      enum Status { OPEN CLOSED }
      type Money { amount: Float! currency: String! }
      type User { id: ID! email: String! }
      type Line { id: ID! qty: Int! price: Money }
      type Order { id: ID! number: String! status: Status! created: DateTime! user: User lines: [Line!]! }
      type Query { order: Order }
    `));
  });
  test.afterAll(() => _setSchemaForTests(null));

  const Q = '{ order { id number status created user { email } lines { id qty price { amount } } } }';
  const good = () => ({ data: { order: { id: 'abc1', number: '7', status: 'OPEN', created: '2026-09-29T08:36:02+00:00', user: null, lines: [{ id: 'l1', qty: 1, price: { amount: 1.5 } }] } } });

  test('accepts a conforming response', () => { expect(() => validateResponse(Q, good())).not.toThrow(); });
  test('accepts null for a nullable object', () => { expect(() => validateResponse('{ order { id } }', { data: { order: null } })).not.toThrow(); });
  test('accepts a GraphQL error envelope', () => { expect(() => validateResponse(Q, { errors: [{ message: 'x' }], data: null })).not.toThrow(); });

  test('rejects enum drift and names the path', () => {
    const b = good(); b.data.order.status = 'ARCHIVED';
    expect(() => validateResponse(Q, b)).toThrow(SchemaValidationError);
    expect(() => validateResponse(Q, b)).toThrow(/data\/order\/status/);
  });
  test('rejects null in a non-null field', () => {
    const b = good(); b.data.order.number = null;
    expect(() => validateResponse(Q, b)).toThrow(/data\/order\/number/);
  });
  test('rejects type change (Float sent as string)', () => {
    const b = good(); b.data.order.lines[0].price.amount = '1.5';
    expect(() => validateResponse(Q, b)).toThrow(/amount/);
  });
  test('rejects a query using a field missing from the schema', () => {
    expect(() => validateResponse('{ order { doesNotExist } }', { data: { order: null } })).toThrow(/does not exist/);
  });
});
