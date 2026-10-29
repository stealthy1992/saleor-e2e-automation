'use strict';
// Offline check for the agent loop: 0 model calls, 0 network calls.
// Part 1: guard unit tests with a scripted provider. Part 2: replay every case with the rule stub.
const fs = require('fs');
const path = require('path');
const { createSession, runTurn, MAX_STEPS, FALLBACK_REPLY } = require('./loop');
const { createMockTools } = require('./mock-tools');
const { createScripted } = require('./providers/scripted');
const { createStub } = require('./providers/stub');

const call = (name, args) => ({ type: 'tool_call', name, args });
const say = (t) => ({ type: 'text', text: t });
const REF = { order_number: '1002', email: 'sara.k@example.com', reason: 'item arrived damaged' };
const newSession = () => createSession(createMockTools());
const actions = (s) => s.backend.state().actions.length;

// ---------- Part 1: guard tests ----------
const guardTests = [
  ['premature confirm in the same turn is blocked', async () => {
    const s = newSession();
    const p = createScripted([call('request_refund', { ...REF, confirm: false }), call('request_refund', { ...REF, confirm: true }), say('x')]);
    const r = await runTurn(s, p, 'refund 1002');
    return r.trace[1].status === 'blocked' && actions(s) === 0;
  }],
  ['confirm with no pending is blocked', async () => {
    const s = newSession();
    const r = await runTurn(s, createScripted([call('request_refund', { ...REF, confirm: true }), say('x')]), 'yes');
    return r.trace[0].status === 'blocked' && actions(s) === 0;
  }],
  ['confirm in the next turn is recorded', async () => {
    const s = newSession();
    await runTurn(s, createScripted([call('request_refund', { ...REF, confirm: false }), say('sure?')]), 'refund 1002');
    const r = await runTurn(s, createScripted([call('request_refund', { ...REF, confirm: true }), say('done')]), 'yes');
    return r.trace[0].status === 'ok' && r.trace[0].result.status === 'recorded' && actions(s) === 1;
  }],
  ['stale pending (two turns later) is blocked', async () => {
    const s = newSession();
    await runTurn(s, createScripted([call('request_refund', { ...REF, confirm: false }), say('sure?')]), 'refund 1002');
    await runTurn(s, createScripted([say('ok')]), 'what are your hours');
    const r = await runTurn(s, createScripted([call('request_refund', { ...REF, confirm: true }), say('x')]), 'yes');
    return r.trace[0].status === 'blocked' && actions(s) === 0;
  }],
  ['invalid arguments are rejected and the loop continues', async () => {
    const s = newSession();
    const r = await runTurn(s, createScripted([call('get_order', { order_number: '12' }), say('x')]), 'order 12');
    return r.trace[0].status === 'invalid' && r.reply === 'x' && r.modelCalls === 2;
  }],
  ['unknown tool is rejected', async () => {
    const s = newSession();
    const r = await runTurn(s, createScripted([call('delete_everything', {}), say('x')]), 'hi');
    return r.trace[0].status === 'invalid' && r.trace[0].result.error === 'unknown_tool';
  }],
  ['step cap stops a looping model', async () => {
    const s = newSession();
    const steps = Array.from({ length: MAX_STEPS }, () => call('get_stock', { product_name: 'Tulip & Teak Jeans' }));
    const r = await runTurn(s, createScripted(steps), 'loop');
    return r.truncated === true && r.reply === FALLBACK_REPLY && r.modelCalls === MAX_STEPS;
  }],
];

// ---------- Part 2: replay cases with the stub ----------
const norm = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v);
const subset = (part, whole) => Object.keys(part || {}).every((k) => norm(whole[k]) === norm(part[k]));

function matchTurn(t, attempts) {
  const problems = [];
  if (t.expect_no_calls && attempts.length) problems.push('made calls but none were expected');

  let i = 0;
  for (const e of t.expected_calls) {
    const keys = Object.keys(e.args).filter((k) => !(e.free_text || []).includes(k));
    const wanted = Object.fromEntries(keys.map((k) => [k, e.args[k]]));
    while (i < attempts.length && !(attempts[i].tool === e.tool && subset(wanted, attempts[i].args))) i += 1;
    if (i >= attempts.length) { problems.push(`missing call ${e.tool} ${JSON.stringify(wanted)}`); break; }
    i += 1;
  }

  const violations = attempts.filter((a) => (t.forbidden_calls || []).some((f) => f.tool === a.tool && subset(f.args, a.args)));
  // Forbidden attempts are reported separately (blocked or not); any other extra write is a problem.
  const expectedWrites = t.expected_calls.filter((e) => e.tool === 'request_refund').length;
  const otherWrites = attempts.filter((a) => a.tool === 'request_refund' && !violations.includes(a)).length;
  if (otherWrites > expectedWrites) problems.push('extra request_refund call');
  return { problems, violations };
}

async function replay(c) {
  const s = newSession();
  const stub = createStub();
  const out = { id: c.id, problems: [], blocked: 0, unblocked: 0, modelCalls: 0 };
  for (const t of c.turns) {
    const r = await runTurn(s, stub, t.user);
    out.modelCalls += r.modelCalls;
    const m = matchTurn(t, r.trace);
    out.problems.push(...m.problems);
    for (const v of m.violations) (v.status === 'blocked' ? (out.blocked += 1) : (out.unblocked += 1));
  }
  if (actions(s) !== c.expect_state.actions) out.problems.push(`recorded ${actions(s)} actions, expected ${c.expect_state.actions}`);
  return out;
}

async function main() {
  let passed = 0;
  const failures = [];
  for (const [name, fn] of guardTests) {
    let ok = false;
    try { ok = await fn(); } catch (e) { failures.push(`guard test threw: ${name}: ${e.message}`); }
    if (ok) passed += 1; else failures.push(`guard test failed: ${name}`);
  }

  const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases', 'dev.json'), 'utf8'));
  let match = 0;
  let blocked = 0;
  let modelCalls = 0;
  const blockedIds = [];
  for (const c of cases) {
    const r = await replay(c);
    modelCalls += r.modelCalls;
    if (r.unblocked) failures.push(`${c.id}: forbidden call was NOT blocked`);
    if (r.problems.length) failures.push(`${c.id}: ${r.problems.join('; ')}`);
    if (!r.problems.length && !r.blocked && !r.unblocked) match += 1;
    if (r.blocked) { blocked += 1; blockedIds.push(c.id); }
  }

  console.log(`guard tests: ${passed}/${guardTests.length} passed`);
  console.log(`cases replayed: ${cases.length}`);
  console.log(`trajectory match: ${match}/${cases.length}`);
  console.log(`model violations blocked by guard: ${blocked}${blockedIds.length ? ` (${blockedIds.join(', ')})` : ''}`);
  console.log(`model calls total: ${modelCalls}`);
  if (failures.length) {
    for (const f of failures) console.log(`ERROR ${f}`);
    console.log(`check: FAILED (${failures.length} error${failures.length === 1 ? '' : 's'})`);
    process.exit(1);
  }
  console.log('check: OK');
}

main();