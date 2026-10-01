'use strict';
// SCRUM-15: fails when the live GraphQL schema breaks vs the committed snapshot (e.g. after a Saleor version bump).
// Refresh deliberately with: npm run schema:snapshot
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { getIntrospectionQuery, buildClientSchema, findBreakingChanges, findDangerousChanges } = require('graphql');

const API = process.env.SALEOR_GRAPHQL_URL || 'http://localhost:8000/graphql/';
const SNAP = path.join(__dirname, '..', '..', 'schemas', 'generated', 'introspection.json');

test.describe('@contract schema drift', () => {
  test.skip(!fs.existsSync(SNAP), 'No snapshot yet - run `npm run schema:snapshot` and commit it');

  test('live schema has no breaking changes vs snapshot', async ({ request }) => {
    const res = await request.post(API, { data: { query: getIntrospectionQuery() } });
    const { data } = await res.json();
    const oldSchema = buildClientSchema(JSON.parse(fs.readFileSync(SNAP, 'utf8')));
    const newSchema = buildClientSchema(data);

    const dangerous = findDangerousChanges(oldSchema, newSchema);
    if (dangerous.length) {
      test.info().annotations.push({ type: 'schema-dangerous', description: dangerous.map((c) => c.description).join('; ').slice(0, 900) });
    }
    const breaking = findBreakingChanges(oldSchema, newSchema).map((c) => `${c.type}: ${c.description}`);
    expect(breaking, 'breaking schema changes').toEqual([]);
  });
});
