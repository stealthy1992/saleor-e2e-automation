'use strict';
// Tiny JSON-Schema builders so operation schemas read like the GraphQL types they describe.
const fs = require('fs');
const path = require('path');

// Enum values snapshotted from the live server by `npm run schema:snapshot` (optional).
let snapshotEnums = {};
try {
  snapshotEnums = JSON.parse(fs.readFileSync(path.join(__dirname, 'generated', 'enums.json'), 'utf8'));
} catch { /* no snapshot yet -> fallbacks below are used */ }

const nullable = (schema) => {
  const out = { ...schema, type: [...new Set([].concat(schema.type, 'null'))] };
  if (schema.enum) out.enum = [...schema.enum, null];
  return out;
};

// Scalars
const str = { type: 'string' };
const int = { type: 'integer' };
const num = { type: 'number' };
const bool = { type: 'boolean' };
const id = { type: 'string', pattern: '^[A-Za-z0-9+/_-]+={0,2}$', minLength: 4 }; // Saleor global IDs are base64
const email = { type: 'string', format: 'email' };
const dateTime = { type: 'string', format: 'date-time' };
const currency = { type: 'string', pattern: '^[A-Z]{3}$' };
const jwt = { type: 'string', pattern: '^[\\w-]+\\.[\\w-]+\\.[\\w-]+$' };
const numericString = { type: 'string', pattern: '^\\d+$' }; // e.g. Order.number is a String in Saleor

// Composites
// Strict by default: every key you SELECT must be described, and nothing else may appear.
const obj = (props, { optional = [], open = false } = {}) => ({
  type: 'object',
  properties: props,
  required: Object.keys(props).filter((k) => !optional.includes(k)),
  additionalProperties: open,
});
const arr = (items, extra = {}) => ({ type: 'array', items, ...extra });
const enumOf = (values) => ({ type: 'string', enum: [...values] });
const gqlEnum = (name, fallback = []) => {
  const values = snapshotEnums[name] || fallback;
  if (!values.length) throw new Error(`gqlEnum("${name}"): not in generated/enums.json and no fallback given`);
  return enumOf(values);
};

const money = obj({ amount: num, currency });
const error = (codes) =>
  obj({ field: nullable(str), message: nullable(str), code: codes ? enumOf(codes) : str });

const pageInfo = obj({
  hasNextPage: bool, hasPreviousPage: bool, startCursor: nullable(str), endCursor: nullable(str),
});
const connection = (node, { totalCount = false, cursor = false } = {}) =>
  obj({
    ...(totalCount ? { totalCount: int } : {}),
    pageInfo,
    edges: arr(obj({ node, ...(cursor ? { cursor: str } : {}) })),
  });

// Response envelopes
const ok = (dataProps) => ({
  type: 'object',
  properties: { data: obj(dataProps), extensions: { type: 'object' } },
  required: ['data'],
  additionalProperties: false, // a top-level `errors` next to `data` is a contract violation
});
const failed = {
  type: 'object',
  properties: {
    data: { type: ['object', 'null'] },
    errors: arr(obj({ message: str, locations: arr({ type: 'object' }), path: arr({}), extensions: { type: 'object' } },
      { optional: ['locations', 'path', 'extensions'] }), { minItems: 1 }),
    extensions: { type: 'object' },
  },
  required: ['errors'],
  additionalProperties: false,
};

module.exports = {
  nullable, str, int, num, bool, id, email, dateTime, currency, jwt, numericString,
  obj, arr, enumOf, gqlEnum, money, error, pageInfo, connection, ok, failed,
};
