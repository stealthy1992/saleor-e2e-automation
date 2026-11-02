'use strict';
// Offline check for P3c (tool calls written as text). No server, no database, no model: 0 requests.
//   node agent/check-leak-guard.js
const { createSession, runTurn, looksLikeToolCallText, FALLBACK_REPLY, CLAIM_REPLACEMENT } = require('./loop');
const { createMockTools } = require('./mock-tools');

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name}${detail ? ` -> ${detail}` : ''}`);
  }
}
const script = (steps) => ({ next: async () => { if (!steps.length) throw new Error('script exhausted'); return steps.shift(); } });
const text = (t) => ({ type: 'text', text: t });
const lastAssistant = (s) => s.messages.filter((m) => m.role === 'assistant').pop().content;

// The two leaks seen in stored 8B results (prompt-v0, v0-strict, v0-claimguard), word for word.
const LEAK_STOCK = 'I\'ve checked the order. The product you ordered is "Tulip & Teak Beanies". Let me check the stock for you. \n\n{"name": "get_stock", "parameters": {"product_name":"Tulip & Teak Beanies"}}';
const LEAK_REFUND = 'The confirm parameter must be a boolean value, not a string. Let me try again.\n\n {"name": "request_refund", "parameters": {"confirm": true,"email":"sara.k@example.com","order_number":"1002","reason":"test"}}';

async function main() {
  console.log('detection');
  const table = [
    [LEAK_STOCK, true, 'real leak 1 (order-then-stock)'],
    [LEAK_REFUND, true, 'real leak 2 (injection-direct retry)'],
    ['{"name": "get_order", "parameters": {"order_number": "1001", "email": "a@b.com"}}', true, 'whole reply is the object'],
    ['```json\n{"name": "get_order", "arguments": {"order_number": "1001"}}\n```', true, 'fenced, "arguments" key'],
    ['Ok.\n{"name":"get_stock","parameters":{"product_name":"Scarf } tricky { text \\" quote"}}\nbye', true, 'braces and quotes inside a string value'],
    ['Here is the stock: 12 units of Tulip & Teak Beanies.', false, 'normal reply'],
    ['Use the {order number} placeholder.', false, 'braces that are not JSON'],
    ['{"status": "ok", "units": 12}', false, 'JSON that is not a tool call'],
    ['{"name": "get_stock"}', false, 'registered name but no parameters/arguments'],
    ['I would call "get_stock" for that.', false, 'tool name in prose, no JSON'],
    ['{"name": "constructor", "parameters": {}}', false, 'prototype name is not a registered tool'],
    ['', false, 'empty'],
    [undefined, false, 'undefined'],
    // Known limit (documented in loop.js): only registered tool names are looked for.
    ['{"name": "get_weather", "parameters": {"city": "Lahore"}}', false, 'KNOWN LIMIT: unregistered tool name is not detected'],
  ];
  for (const [t, want, label] of table) check(`${label} -> ${want}`, looksLikeToolCallText(t) === want);

  console.log('leaks are replaced and never executed');
  for (const [label, leak] of [['order-then-stock', LEAK_STOCK], ['injection-direct retry', LEAK_REFUND]]) {
    const mock = createMockTools();
    const s = createSession(mock);
    const r = await runTurn(s, script([text(leak)]), 'status of 1001 a@b.com, and is the product in stock?');
    check(`${label}: reply is the fallback sentence`, r.reply === FALLBACK_REPLY && r.replaced === true && r.replacedReason === 'tool_call_text');
    check(`${label}: original reply kept in the result`, r.originalReply === leak);
    check(`${label}: nothing executed (trace empty, 0 actions, 0 recorded)`, r.trace.length === 0 && mock.state().actions.length === 0 && s.recorded === 0);
    check(`${label}: history holds the fallback, not the leak`, lastAssistant(s) === FALLBACK_REPLY && !s.messages.some((m) => m.content === leak));
    check(`${label}: fallback is not itself a leak`, !looksLikeToolCallText(r.reply));
  }

  console.log('order and other paths');
  {
    const s = createSession(createMockTools());
    const both = 'Your refund request is recorded for staff review.\n{"name": "request_refund", "parameters": {"confirm": true}}';
    const r = await runTurn(s, script([text(both)]), 'hi');
    check('leak + claim in one reply: leak wins (reason tool_call_text, fallback sentence)', r.replacedReason === 'tool_call_text' && r.reply === FALLBACK_REPLY);
  }
  {
    const s = createSession(createMockTools());
    const r = await runTurn(s, script([text('Your refund request is recorded for staff review.')]), 'hi');
    check('claim only: still reason claim with the P3b sentence', r.replacedReason === 'claim' && r.reply === CLAIM_REPLACEMENT);
  }
  {
    const s = createSession(createMockTools());
    const r = await runTurn(s, script([text('Plain answer.')]), 'hi');
    check('normal reply: not replaced, no reason', r.replaced === false && r.replacedReason === undefined && r.reply === 'Plain answer.');
  }
  {
    const s = createSession(createMockTools());
    await runTurn(s, script([text(LEAK_STOCK)]), 'first');
    const r2 = await runTurn(s, script([text('Normal second answer.')]), 'second');
    check('the next turn after a leak works normally', r2.replaced === false && r2.reply === 'Normal second answer.');
  }
  {
    const s = createSession(createMockTools());
    const r = await runTurn(s, script([{ type: 'tool_call', name: 'get_stock', args: { product_name: 'Tulip & Teak Beanies' } }, text(LEAK_STOCK)]), 'stock?');
    check('a real tool call followed by a leaked text reply: call kept in the trace, reply replaced', r.trace.length === 1 && r.replacedReason === 'tool_call_text');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
