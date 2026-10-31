'use strict';
// Live smoke test: 3 cases (4 messages) against a RUNNING agent with a real model.
//   $env:AGENT_PORT = "3201"; $env:AGENT_PROVIDER = "ollama"; npm run agent        (terminal 1)
//   npm run agent:smoke                                                           (terminal 2)
// Checks the TOOL CALLS the model made (names, key arguments, order), never its wording.
// Expected with the ideal trajectory: 8 model requests (4 messages x (1 tool call + 1 final text)).
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const BASE = (process.env.AGENT_URL || 'http://localhost:3201').replace(/\/$/, '');
const MOCK = { order: '1001', email: 'amir.jee@example.com' };
const IDEAL_REQUESTS = 8;

let failed = 0;
const verdict = (ok, label) => { if (!ok) failed += 1; console.log(`    ${ok ? 'PASS' : 'FAIL'}  ${label}`); };

async function http(method, url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(300000),
  });
  return { status: res.status, json: await res.json() };
}

function show(body) {
  for (const t of body.trace || []) {
    const result = JSON.stringify(t.result);
    console.log(`    step ${t.step}: ${t.tool} ${JSON.stringify(t.args)} -> ${t.status} ${result.length > 110 ? `${result.slice(0, 110)}...` : result}`);
  }
  console.log(`    reply: ${body.reply}`);
  console.log(`    model_calls=${body.model_calls} truncated=${body.truncated}`);
}

async function say(sessionId, message) {
  console.log(`\n> ${message}`);
  const r = await http('POST', '/api/agent', { session_id: sessionId, message });
  if (r.status !== 200) throw new Error(`POST /api/agent answered HTTP ${r.status}: ${JSON.stringify(r.json)}`);
  if (!r.json.trace) throw new Error('the agent does not return a trace (AGENT_EXPOSE_TRACE=0); the smoke test needs it');
  show(r.json);
  return r.json;
}

// Saleor backend: use SMOKE_ORDER / SMOKE_EMAIL, or find an unfulfilled order the same way agent-saleor.spec.js does.
async function findOrder(backend) {
  if (backend !== 'saleor') return { ...MOCK, db: null };
  if (process.env.SMOKE_ORDER && process.env.SMOKE_EMAIL) return { order: process.env.SMOKE_ORDER, email: process.env.SMOKE_EMAIL, db: null };
  const db = require('../utils/db-client');
  const rows = await db.query(
    `SELECT number, user_email FROM order_order
      WHERE user_email <> '' AND status = 'unfulfilled' AND number >= 100 ORDER BY number ASC LIMIT 1`);
  if (!rows[0]) throw new Error('no unfulfilled order with number >= 100 found; set SMOKE_ORDER and SMOKE_EMAIL');
  return { order: String(rows[0].number), email: rows[0].user_email, db };
}

const calls = (body, tool) => (body.trace || []).filter((t) => t.tool === tool);

(async () => {
  const health = (await http('GET', '/health')).json;
  console.log(`agent ${BASE}: provider=${health.provider} model=${health.model || '-'} backend=${health.backend}`);
  const { order, email, db } = await findOrder(health.backend);
  console.log(`test order: ${order} (${health.backend} backend)`);
  const sid = `smoke-${Math.random().toString(36).slice(2, 10)}`;
  const requestsBefore = health.model_requests;
  let modelCalls = 0;

  try {
    console.log('\n[1] order status');
    let b = await say(`${sid}-a`, `What is the status of order ${order}? My email is ${email}.`);
    modelCalls += b.model_calls;
    const go = calls(b, 'get_order')[0];
    verdict(Boolean(go) && go.args.order_number === order && go.args.email.toLowerCase() === email.toLowerCase() && go.status === 'ok', 'get_order called with the right number and email, result ok');

    console.log('\n[2] delivery policy');
    b = await say(`${sid}-b`, 'How long does delivery to Lahore take?');
    modelCalls += b.model_calls;
    const gp = calls(b, 'get_policy_clause')[0];
    verdict(Boolean(gp) && gp.args.section === '3.1' && gp.status === 'ok', 'get_policy_clause called with section 3.1');
    verdict(calls(b, 'get_order').length === 0, 'no get_order for a policy question');

    console.log('\n[3] refund: pending, then confirmed');
    b = await say(`${sid}-c`, `I want a refund for order ${order}, email ${email}. The item does not fit.`);
    modelCalls += b.model_calls;
    const r1 = calls(b, 'request_refund');
    verdict(r1.length === 1 && r1[0].args.confirm === false && r1[0].result.status === 'pending_confirmation', 'one request_refund with confirm=false, result pending_confirmation');
    verdict(calls(b, 'get_order').length === 0, 'get_order NOT called before the refund (rule 5)');
    b = await say(`${sid}-c`, 'Yes, please go ahead.');
    modelCalls += b.model_calls;
    const r2 = calls(b, 'request_refund');
    verdict(r2.length === 1 && r2[0].args.confirm === true && r2[0].status === 'ok' && r2[0].result.status === 'recorded', 'one request_refund with confirm=true, status ok, result recorded');
    const st = (await http('GET', `/api/agent/state?session_id=${sid}-c`)).json;
    verdict(Array.isArray(st.actions) && st.actions.length === 1 && st.pending === 0, `state: 1 action recorded, 0 pending (got actions=${(st.actions || []).length}, pending=${st.pending})`);
  } finally {
    if (db) {
      await db.query(`DELETE FROM agent_actions WHERE session_id LIKE 'smoke-%'`);
      await db.closePool();
    }
  }

  const healthAfter = (await http('GET', '/health')).json;
  const after = healthAfter.model_requests;
  if (typeof healthAfter.coercions === 'number') console.log(`string booleans converted by the adapter (since server start): ${healthAfter.coercions}`);
  console.log('\n--- summary ---');
  console.log(`model requests (loop count): ${modelCalls}, ideal ${IDEAL_REQUESTS}`);
  if (typeof after === 'number' && typeof requestsBefore === 'number') {
    console.log(`HTTP requests sent to ${health.provider} by this smoke run: ${after - requestsBefore} (includes retries)`);
  }
  console.log(failed ? `smoke: FAILED (${failed} check(s))` : 'smoke: OK');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(`smoke error: ${e.message}`); process.exit(1); });
