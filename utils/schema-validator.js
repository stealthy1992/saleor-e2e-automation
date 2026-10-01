'use strict';
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const operations = require('../schemas/operations');

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
addFormats(ajv);
const compiled = new Map();

function compile(name) {
  if (!operations[name]) {
    throw new Error(`Unknown schema "${name}". Known: ${Object.keys(operations).join(', ')}`);
  }
  if (!compiled.has(name)) compiled.set(name, ajv.compile(operations[name]));
  return compiled.get(name);
}

function describe(e) {
  const where = e.instancePath || '(root)';
  if (e.keyword === 'additionalProperties') return `${where}: unexpected property "${e.params.additionalProperty}"`;
  if (e.keyword === 'enum') return `${where}: ${e.message} [${e.params.allowedValues.join(' | ')}]`;
  if (e.keyword === 'type') return `${where}: expected ${[].concat(e.params.type).join(' | ')}`;
  return `${where}: ${e.message}`;
}

/** @param {{dataOnly?: boolean}} opts dataOnly=true wraps a bare `data` object into `{data}` first. */
function validate(name, payload, { dataOnly = false } = {}) {
  const fn = compile(name);
  const body = dataOnly ? { data: payload } : payload;
  const valid = fn(body);
  return { valid, errors: valid ? [] : fn.errors.map(describe) };
}

module.exports = { validate, operations };
