// H1 + H2 offline check: abnormal model output through runTurn. 0 model requests.
const { createSession, runTurn, FALLBACK_REPLY } = require('./loop');
const { createMockTools } = require('./mock-tools');

let passed = 0, failed = 0;
const check = (name, ok) => { if (ok) passed += 1; else { failed += 1; console.log('FAIL:', name); } };
const scripted = (steps) => { let i = 0; return { next: async () => steps[Math.min(i++, steps.length - 1)] }; };
const call = (name, args) => ({ type: 'tool_call', name, args });
const text = (t) => ({ type: 'text', text: t });
const run = async (steps) => { const s = createSession(createMockTools()); return { s, r: await runTurn(s, scripted(steps), 'hi') }; };

(async () => {
  // H1: names that exist on every JS object are unknown tools, and the turn continues.
  for (const name of ['constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf']) {
    const { r } = await run([call(name, {}), text('done')]);
    check(`H1 ${name}: invalid unknown_tool`, r.trace.length === 1 && r.trace[0].status === 'invalid' && r.trace[0].result.error === 'unknown_tool');
    check(`H1 ${name}: turn continues`, r.reply === 'done' && r.replaced === false);
  }
  for (const name of [undefined, null, 42, {}]) {
    const { r } = await run([call(name, {}), text('done')]);
    check(`H1 non-string name ${JSON.stringify(name)}: invalid`, r.trace[0].status === 'invalid' && r.reply === 'done');
  }
  const ok = await run([call('get_stock', { product_name: 'Tulip & Teak Beanies' }), text('done')]);
  check('H1 real tool still runs', ok.r.trace[0].status === 'ok');

  // H2: empty, whitespace-only and non-string replies are replaced.
  for (const [label, t] of [['empty', ''], ['spaces/newlines', '  \n\t '], ['undefined', undefined], ['null', null], ['object', { a: 1 }], ['number', 5]]) {
    const { s, r } = await run([{ type: 'text', text: t }]);
    check(`H2 ${label}: replaced with FALLBACK_REPLY`, r.reply === FALLBACK_REPLY && r.replaced === true && r.replacedReason === 'empty_reply');
    check(`H2 ${label}: originalReply is a string`, typeof r.originalReply === 'string');
    check(`H2 ${label}: history holds the replacement`, s.messages[s.messages.length - 1].content === FALLBACK_REPLY);
  }
  const normal = await run([text('Your order is unfulfilled.')]);
  check('H2 normal reply unchanged', normal.r.reply === 'Your order is unfulfilled.' && normal.r.replaced === false);
  const leak = await run([text('{"name": "get_stock", "parameters": {"product_name": "x"}}')]);
  check('P3c still wins for a leaked call', leak.r.replacedReason === 'tool_call_text');
  const claim = await run([text('The request for a refund has been recorded.')]);
  check('P3b still wins for a false claim', claim.r.replacedReason === 'claim');

  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
