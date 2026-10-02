'use strict';
// validateResponse(query, body) -> throws SchemaValidationError when the response violates the contract
// derived from the committed introspection snapshot.  SCHEMA_VALIDATE = strict (default) | warn | off
const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { buildClientSchema } = require('graphql');
const { buildResponseSchema } = require('./schema-from-query');

const SNAPSHOT = path.join(__dirname, '..', 'schemas', 'generated', 'introspection.json');
const COVERAGE_DIR = path.join(__dirname, '..', 'test-results', 'schema-coverage');

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
addFormats(ajv);

class SchemaValidationError extends Error {
  constructor(message, details) { super(message); this.name = 'SchemaValidationError'; this.details = details; }
}

let gqlSchema = null;
let warnedNoSnapshot = false;
const compiled = new Map(); // query string -> { name, ok, fail }
const coverage = new Map(); // operation name -> { responses, failures }

function getSchema() {
  if (gqlSchema) return gqlSchema;
  if (!fs.existsSync(SNAPSHOT)) return null;
  gqlSchema = buildClientSchema(JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')));
  return gqlSchema;
}

function fmt(e) {
  const where = e.instancePath || '(root)';
  if (e.keyword === 'additionalProperties') return `${where}: unexpected property "${e.params.additionalProperty}"`;
  if (e.keyword === 'enum') return `${where}: value not in [${e.params.allowedValues.join(' | ')}]`;
  if (e.keyword === 'type') return `${where}: expected ${[].concat(e.params.type).join(' | ')}`;
  return `${where}: ${e.message}`;
}

function record(name, failed) {
  const c = coverage.get(name) || { responses: 0, failures: 0 };
  c.responses += 1; if (failed) c.failures += 1;
  coverage.set(name, c);
}

function validateResponse(query, body, { operationName, mode: modeOverride, record: shouldRecord = true }  = {}) {
  // const mode = (process.env.SCHEMA_VALIDATE || 'strict').toLowerCase();
  const mode = (modeOverride || process.env.SCHEMA_VALIDATE || 'strict').toLowerCase();
  if (mode === 'off') return;
  const schema = getSchema();
  if (!schema) {
    if (!warnedNoSnapshot) { warnedNoSnapshot = true; console.warn('[schema] no introspection snapshot - run `npm run schema:snapshot`; validation skipped'); }
    return;
  }
  const key = `${operationName || ''}::${query}`;
  let entry = compiled.get(key);
  if (!entry) {
    try {
      const built = buildResponseSchema(schema, query, operationName);
      entry = { name: built.operationName, ok: ajv.compile(built.success), fail: ajv.compile(built.failure), unknownScalars: built.unknownScalars };
    } catch (err) {
      throw new SchemaValidationError(`[schema] Cannot derive contract for operation: ${err.message}. If the backend changed, re-run \`npm run schema:snapshot\`.`, []);
    }
    compiled.set(key, entry);
  }
  const validator = body && body.errors ? entry.fail : entry.ok;
  const valid = validator(body);
  if (shouldRecord) record(entry.name, !valid);
  // record(entry.name, !valid);
  if (valid) return;

  const problems = validator.errors.map(fmt);
  const shown = problems.slice(0, 8).join('\n  - ') + (problems.length > 8 ? `\n  - ...and ${problems.length - 8} more` : '');
  const msg = `[schema] Response for "${entry.name}" violates the introspected GraphQL contract:\n  - ${shown}`;
  if (mode === 'warn') { console.warn(msg); return; }
  throw new SchemaValidationError(msg, problems);
}

process.on('exit', () => {
  if (!coverage.size) return;
  try {
    fs.mkdirSync(COVERAGE_DIR, { recursive: true });
    fs.writeFileSync(path.join(COVERAGE_DIR, `${process.pid}.json`), JSON.stringify(Object.fromEntries(coverage)));
  } catch { /* best effort */ }
});

module.exports = { validateResponse, SchemaValidationError, _setSchemaForTests: (s) => { gqlSchema = s; compiled.clear(); } };
