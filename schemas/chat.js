'use strict';
const Ajv = require('ajv');
const { obj, arr, str, enumOf } = require('./helpers');

const LABELS = ['ANSWERABLE', 'NOT_COVERED', 'CONFLICT', 'AMBIGUOUS', 'OFF_TOPIC'];

// POST /api/chat success body. Strict: every key required, no extra keys.
const chatReply = obj({
  answer: { type: 'string', minLength: 1 },
  clauses: arr({ type: 'string', pattern: '^\\d+\\.\\d+$' }),
  label: enumOf(LABELS),
});

// POST /api/chat error body, for example {"error":"llm_error"}.
const chatError = obj({ error: str });

const ajv = new Ajv({ allErrors: true });
const compiled = {
  chatReply: ajv.compile(chatReply),
  chatError: ajv.compile(chatError),
};

function validateChat(name, payload) {
  const fn = compiled[name];
  if (!fn) throw new Error(`Unknown chat schema "${name}". Known: ${Object.keys(compiled).join(', ')}`);
  const valid = fn(payload);
  return {
    valid,
    errors: valid ? [] : fn.errors.map((e) => `${e.instancePath || '(root)'}: ${e.message}`),
  };
}

module.exports = { chatReply, chatError, validateChat, LABELS };
