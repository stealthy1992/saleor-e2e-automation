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

function validateArgs(name, args) {
  const fn = compiled[name];
  if (!fn) throw new Error(`Unknown tool "${name}". Known: ${Object.keys(compiled).join(', ')}`);
  const valid = fn(args);
  return {
    valid,
    errors: valid ? [] : fn.errors.map((e) => `${e.instancePath || '(root)'}: ${e.message}`),
  };
}

module.exports = { TOOLS, TOOL_BY_NAME, validateArgs };
