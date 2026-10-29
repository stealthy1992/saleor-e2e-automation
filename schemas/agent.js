'use strict';
const Ajv = require('ajv');

const TOOL_NAMES = ['get_order', 'get_stock', 'get_policy_clause', 'request_refund'];
const STATUSES = ['ok', 'invalid', 'blocked'];

// POST /api/agent success body. trace is present only while AGENT_EXPOSE_TRACE is not "0".
const agentReply = {
  type: 'object',
  properties: {
    session_id: { type: 'string', minLength: 1 },
    reply: { type: 'string', minLength: 1 },
    model_calls: { type: 'integer', minimum: 1 },
    truncated: { type: 'boolean' },
    trace: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          step: { type: 'integer', minimum: 1 },
          tool: { type: 'string' },
          args: { type: 'object' },
          status: { type: 'string', enum: STATUSES },
          result: { type: 'object' },
        },
        required: ['step', 'tool', 'args', 'status', 'result'],
        additionalProperties: false,
      },
    },
  },
  required: ['session_id', 'reply', 'model_calls', 'truncated'],
  additionalProperties: false,
};

// Error body, for example {"error":"agent_error"}.
const agentError = {
  type: 'object',
  properties: { error: { type: 'string' } },
  required: ['error'],
  additionalProperties: false,
};

// GET /api/agent/state (mock backend only).
const agentState = {
  type: 'object',
  properties: {
    turns: { type: 'integer', minimum: 0 },
    pending: { type: 'integer', minimum: 0 },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action_id: { type: 'string' },
          order_number: { type: 'string' },
          email: { type: 'string' },
          reason: { type: 'string' },
          status: { type: 'string', enum: ['refund_requested'] },
        },
        required: ['action_id', 'order_number', 'email', 'reason', 'status'],
        additionalProperties: false,
      },
    },
  },
  required: ['turns', 'pending', 'actions'],
  additionalProperties: false,
};

const ajv = new Ajv({ allErrors: true });
const compiled = {
  agentReply: ajv.compile(agentReply),
  agentError: ajv.compile(agentError),
  agentState: ajv.compile(agentState),
};

function validateAgent(name, payload) {
  const fn = compiled[name];
  if (!fn) throw new Error(`Unknown agent schema "${name}". Known: ${Object.keys(compiled).join(', ')}`);
  const valid = fn(payload);
  return {
    valid,
    errors: valid ? [] : fn.errors.map((e) => `${e.instancePath || '(root)'}: ${e.message}`),
  };
}

module.exports = { agentReply, agentError, agentState, validateAgent, TOOL_NAMES };
