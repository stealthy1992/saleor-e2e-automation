'use strict';
// Offline check for agent cases: 0 model calls, 0 network calls.
// Usage: node agent/check-cases.js [dir]   (default dir: agent/cases)
const fs = require('fs');
const path = require('path');
const { TOOL_BY_NAME, validateArgs } = require('./tools');
const { createMockTools } = require('./mock-tools');

const CATEGORIES = ['read', 'multi_step', 'abstain', 'bad_input', 'write_gate', 'injection'];
const dir = path.resolve(process.argv[2] || path.join(__dirname, 'cases'));

// Every key in `part` must equal the same key in `whole`.
function isSubset(part, whole) {
  return Object.keys(part || {}).every((k) => whole && whole[k] === part[k]);
}

function loadCases(d) {
  const files = fs.readdirSync(d).filter((f) => f.endsWith('.json')).sort();
  const cases = [];
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
    if (!Array.isArray(data)) throw new Error(`${f}: top level must be an array`);
    for (const c of data) cases.push({ ...c, _file: f });
  }
  return cases;
}

function checkCase(c, seen) {
  const errs = [];
  const at = (msg) => errs.push(`${c._file} ${c.id || '(no id)'}: ${msg}`);

  if (typeof c.id !== 'string' || !/^[a-z0-9-]+$/.test(c.id)) at('id must match ^[a-z0-9-]+$');
  else if (seen.has(c.id)) at('duplicate id');
  else seen.add(c.id);

  if (!CATEGORIES.includes(c.category)) at(`category must be one of ${CATEGORIES.join(', ')}`);
  if (!c.expect_state || !Number.isInteger(c.expect_state.actions) || c.expect_state.actions < 0) {
    at('expect_state.actions must be an integer >= 0');
  }
  if (!Array.isArray(c.turns) || c.turns.length === 0) {
    at('turns must be a non-empty array');
    return errs;
  }

  const mock = createMockTools();
  c.turns.forEach((t, i) => {
    const tn = `turn ${i + 1}`;
    if (typeof t.user !== 'string' || !t.user.trim()) at(`${tn}: user must be a non-empty string`);
    if (!Array.isArray(t.expected_calls)) {
      at(`${tn}: expected_calls must be an array`);
      return;
    }
    const forbidden = t.forbidden_calls === undefined ? [] : t.forbidden_calls;
    if (!Array.isArray(forbidden)) {
      at(`${tn}: forbidden_calls must be an array`);
      return;
    }
    if (t.expect_no_calls && t.expected_calls.length) at(`${tn}: expect_no_calls is true but expected_calls is not empty`);

    for (const f of forbidden) {
      const tool = TOOL_BY_NAME[f.tool];
      if (!tool) {
        at(`${tn}: forbidden tool "${f.tool}" is unknown`);
        continue;
      }
      for (const k of Object.keys(f.args || {})) {
        if (!(k in tool.parameters.properties)) at(`${tn}: forbidden arg "${k}" is not a parameter of ${f.tool}`);
      }
    }

    for (const e of t.expected_calls) {
      if (!TOOL_BY_NAME[e.tool]) {
        at(`${tn}: expected tool "${e.tool}" is unknown`);
        continue;
      }
      const v = validateArgs(e.tool, e.args);
      if (!v.valid) {
        at(`${tn}: ${e.tool} args invalid: ${v.errors.join('; ')}`);
        continue;
      }
      for (const k of e.free_text || []) {
        if (!(k in e.args)) at(`${tn}: free_text key "${k}" is not in ${e.tool} args`);
      }
      if (e.tool === 'request_refund' && e.args.confirm === true && i === 0) {
        at(`${tn}: request_refund confirm:true cannot be in the first turn`);
      }
      if (forbidden.some((f) => f.tool === e.tool && isSubset(f.args, e.args))) {
        at(`${tn}: expected call ${e.tool} is also forbidden`);
      }
      const r = mock.call(e.tool, e.args);
      if (!r.ok) at(`${tn}: mock rejected ${e.tool}: ${r.error}`);
      else if (r.result.status === 'rejected' && !e.expect_rejected) at(`${tn}: mock rejected ${e.tool}: ${r.result.error}`);
      else if (r.result.status !== 'rejected' && e.expect_rejected) at(`${tn}: ${e.tool} has expect_rejected but the mock accepted it`);
    }
  });

  if (!errs.length) {
    const actual = mock.state().actions.length;
    if (actual !== c.expect_state.actions) {
      at(`replay recorded ${actual} actions, expect_state says ${c.expect_state.actions}`);
    }
  }
  return errs;
}

function main() {
  let cases;
  try {
    cases = loadCases(dir);
  } catch (e) {
    console.error(`load error: ${e.message}`);
    process.exit(1);
  }
  if (!cases.length) {
    console.error(`no cases found in ${dir}`);
    process.exit(1);
  }

  const seen = new Set();
  const errors = [];
  for (const c of cases) errors.push(...checkCase(c, seen));

  const byCat = {};
  const byTool = {};
  let total = 0;
  for (const c of cases) {
    byCat[c.category] = (byCat[c.category] || 0) + 1;
    for (const t of Array.isArray(c.turns) ? c.turns : []) {
      for (const e of Array.isArray(t.expected_calls) ? t.expected_calls : []) {
        byTool[e.tool] = (byTool[e.tool] || 0) + 1;
        total += 1;
      }
    }
  }

  const cats = CATEGORIES.map((k) => `${k} ${byCat[k] || 0}`).join(', ');
  const tools = Object.keys(TOOL_BY_NAME).map((k) => `${k} ${byTool[k] || 0}`).join(', ');
  console.log(`dir: ${dir}`);
  console.log(`cases: ${cases.length} (${cats})`);
  console.log(`expected calls: ${total} (${tools})`);
  if (errors.length) {
    for (const e of errors) console.log(`ERROR ${e}`);
    console.log(`check: FAILED (${errors.length} error${errors.length === 1 ? '' : 's'})`);
    process.exit(1);
  }
  console.log('check: OK');
}

main();