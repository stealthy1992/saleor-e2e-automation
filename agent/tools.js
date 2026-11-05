'use strict';
const Ajv = require('ajv');

const EMAIL_PATTERN = '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$';

// Plain JSON Schema. P1 converts these to the Gemini / Ollama tool formats.
const TOOLS = [
  {
    name: 'get_order',
    kind: 'read',
    description:
      'Look up one order by its number and the email used to place it. Returns status, payment status, totals and line items, or found:false.',
    parameters: {
      type: 'object',
      properties: {
        order_number: { type: 'string', pattern: '^\\d{3,10}$' },
        email: { type: 'string', pattern: EMAIL_PATTERN },
      },
      required: ['order_number', 'email'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_stock',
    kind: 'read',
    description: 'Check the available quantity and price of one product by its exact name.',
    parameters: {
      type: 'object',
      properties: {
        product_name: { type: 'string', minLength: 1, maxLength: 100 },
      },
      required: ['product_name'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_policy_clause',
    kind: 'read',
    description: 'Fetch one clause of the store policy by its number, for example "3.1".',
    parameters: {
      type: 'object',
      properties: {
        section: { type: 'string', pattern: '^\\d+\\.\\d+$' },
      },
      required: ['section'],
      additionalProperties: false,
    },
  },
  {
    name: 'request_refund',
    kind: 'write',
    description:
      'Request a refund for an order. With confirm=false nothing is recorded: it returns pending_confirmation and the customer must be asked to confirm. With confirm=true it records the request, only after a pending confirmation exists and the customer has confirmed in a later message.',
    parameters: {
      type: 'object',
      properties: {
        order_number: { type: 'string', pattern: '^\\d{3,10}$' },
        email: { type: 'string', pattern: EMAIL_PATTERN },
        reason: { type: 'string', minLength: 3, maxLength: 300 },
        confirm: { type: 'boolean' },
      },
      required: ['order_number', 'email', 'reason', 'confirm'],
      additionalProperties: false,
    },
  },
];

const ajv = new Ajv({ allErrors: true });
const TOOL_BY_NAME = {};
const compiled = {};
for (const tool of TOOLS) {
  TOOL_BY_NAME[tool.name] = tool;
  compiled[tool.name] = ajv.compile(tool.parameters);
}

// H1: own-property lookup only. A plain object also "has" constructor, toString and __proto__.
const isKnownTool = (name) => typeof name === 'string' && Object.prototype.hasOwnProperty.call(TOOL_BY_NAME, name);

function validateArgs(name, args) {
  const fn = isKnownTool(name) ? compiled[name] : undefined;
  if (!fn) throw new Error(`Unknown tool "${name}". Known: ${Object.keys(compiled).join(', ')}`);
  const valid = fn(args);
  return {
    valid,
    errors: valid ? [] : fn.errors.map((e) => `${e.instancePath || '(root)'}: ${e.message}`),
  };
}

// Deterministic refund eligibility (P3a, P3e). Returns an error code when a refund must not be requested, else null.
// Money facts only, first match wins:
//   1. paymentStatus FULLY_REFUNDED -> already_refunded
//   2. nothing was ever charged (unpaid paymentStatus AND chargeStatus NONE) on an order that has not shipped
//      (UNFULFILLED or UNCONFIRMED) -> not_paid (policy 4.1: cancel instead). A delivered order with no
//      recorded charge (cash on delivery) is NOT matched.
// Everything else is allowed. Order statuses such as CANCELED or RETURNED are never a reason here.
const UNPAID_PAYMENT_STATUSES = ['NOT_CHARGED', 'PENDING', 'REFUSED', 'CANCELLED'];
const NOT_SHIPPED_STATUSES = ['UNFULFILLED', 'UNCONFIRMED'];

function refundBlockedReason(facts) {
  if (!facts) return null;
  if (facts.paymentStatus === 'FULLY_REFUNDED') return 'already_refunded';
  if (
    UNPAID_PAYMENT_STATUSES.includes(facts.paymentStatus) &&
    facts.chargeStatus === 'NONE' &&
    NOT_SHIPPED_STATUSES.includes(facts.status)
  ) {
    return 'not_paid';
  }
  return null;
}

module.exports = { TOOLS, TOOL_BY_NAME, isKnownTool, validateArgs, refundBlockedReason };
