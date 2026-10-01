'use strict';
// node scripts/snapshot-schema.js   ->  schemas/generated/{introspection,enums}.json
const fs = require('fs');
const path = require('path');
const { getIntrospectionQuery, buildClientSchema, isEnumType } = require('graphql');

const API = process.env.SALEOR_GRAPHQL_URL || 'http://localhost:8000/graphql/';
const OUT = path.join(__dirname, '..', 'schemas', 'generated');

function extractEnums(schema) {
  const enums = {};
  for (const [name, type] of Object.entries(schema.getTypeMap())) {
    if (isEnumType(type) && !name.startsWith('__')) enums[name] = type.getValues().map((v) => v.name).sort();
  }
  return enums;
}

async function main() {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: getIntrospectionQuery() }),
  });
  const body = await res.json();
  if (!body.data) throw new Error(`Introspection failed: ${JSON.stringify(body.errors || body).slice(0, 300)}`);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'introspection.json'), JSON.stringify(body.data));
  const enums = extractEnums(buildClientSchema(body.data));
  fs.writeFileSync(path.join(OUT, 'enums.json'), JSON.stringify(enums, null, 2));
  console.log(`Snapshot written from ${API}: ${Object.keys(enums).length} enums`);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { extractEnums };
