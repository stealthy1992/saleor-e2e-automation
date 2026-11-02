'use strict';
// Offline check for P3b (false "recorded" claims). No server, no database, no model: 0 requests.
//   node agent/check-claim-guard.js
const { createSession, runTurn, hasRecordedClaim, CLAIM_REPLACEMENT } = require('./loop');
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

// Scripted provider: returns the given steps one by one (a step is a tool_call or a text).
const script = (steps) => ({ next: async () => { if (!steps.length) throw new Error('script exhausted'); return steps.shift(); } });
const text = (t) => ({ type: 'text', text: t });
const call = (args) => ({ type: 'tool_call', name: 'request_refund', args });
const R = { order_number: '1002', email: 'sara.k@example.com', reason: 'item arrived damaged' };
const lastAssistant = (s) => s.messages.filter((m) => m.role === 'assistant' && m.content !== undefined).pop().content;
const CLAIM = 'Your refund request is recorded for staff review.';

async function main() {
  console.log('claim detection (option D: word "recorded", no negation in the same sentence)');
  const table = [
    [CLAIM, true],
    ['Done. Your request has been recorded.', true],
    ['RECORDED for staff review', true],
    ['It is not recorded yet.', false],
    ["The refund isn't recorded.", false],
    ['Sorry. I could not do that. It was never recorded.', false],
    ['It is not recorded. Your request is recorded for staff review.', true],
    ['Your request is unrecorded.', false],
    ['I will record it after you confirm.', false],
    ['', false],
    [undefined, false],
    // Known limit (documented in loop.js): a negation word elsewhere in the sentence hides a real claim.
    ['Not to worry, it is recorded.', false],
  ];
  for (const [t, want] of table) check(`${JSON.stringify(t)} -> ${want}`, hasRecordedClaim(t) === want);
  check('replacement text does not contain the word "recorded"', !/recorded/i.test(CLAIM_REPLACEMENT));
  check('replacement text is not itself a claim', hasRecordedClaim(CLAIM_REPLACEMENT) === false);

  console.log('false claims are replaced');
  {
    const mock = createMockTools();
    const s = createSession(mock);
    const r = await runTurn(s, script([call({ ...R, confirm: 'true' }), text(CLAIM)]), 'yes please');
    check('after an invalid call: reply replaced', r.replaced === true && r.reply === CLAIM_REPLACEMENT, JSON.stringify(r.reply));
    check('original reply kept in the result', r.originalReply === CLAIM);
    check('trace still shows the invalid attempt', r.trace.length === 1 && r.trace[0].status === 'invalid');
    check('history holds the replacement, not the false claim', lastAssistant(s) === CLAIM_REPLACEMENT && !s.messages.some((m) => m.content === CLAIM));
    check('no action, no recording counted', mock.state().actions.length === 0 && s.recorded === 0);
  }
  {
    const s = createSession(createMockTools());
    const r = await runTurn(s, script([call({ ...R, confirm: true }), text(CLAIM)]), 'Refund 1002, I confirm');
    check('after a blocked call: reply replaced', r.replaced === true && r.trace[0].status === 'blocked');
  }
  {
    const s = createSession(createMockTools());
    const r = await runTurn(s, script([text(CLAIM)]), 'hello');
    check('with no tool call at all: reply replaced', r.replaced === true && r.trace.length === 0);
  }
  {
    const s = createSession(createMockTools());
    const r = await runTurn(s, script([call({ ...R, confirm: false }), text('Your request is recorded for staff review.')]), 'refund 1002');
    check('after a confirm:false call (only pending): reply replaced', r.replaced === true && r.trace[0].result.status === 'pending_confirmation');
  }

  console.log('honest replies are kept');
  {
    const s = createSession(createMockTools());
    const honest = 'Sorry, that did not work. The request is not recorded yet.';
    const r = await runTurn(s, script([call({ ...R, confirm: 'true' }), text(honest)]), 'yes');
    check('"not recorded yet" kept as written', r.replaced === false && r.reply === honest && r.originalReply === undefined);
  }
  {
    const s = createSession(createMockTools());
    const r = await runTurn(s, script([text('I can help with delivery, payment, returns and stock.')]), 'hi');
    check('unrelated reply kept', r.replaced === false);
  }

  console.log('real recordings are kept');
  {
    const mock = createMockTools();
    const s = createSession(mock);
    const r1 = await runTurn(s, script([call({ ...R, confirm: false }), text('Shall I request this refund? Please reply yes.')]), 'refund 1002 sara.k@example.com damaged');
    check('turn 1: pending, question kept', r1.replaced === false && r1.trace[0].result.status === 'pending_confirmation');
    const r2 = await runTurn(s, script([call({ ...R, confirm: true }), text(CLAIM)]), 'yes');
    check('turn 2: recorded for real, claim kept', r2.replaced === false && r2.reply === CLAIM && r2.trace[0].result.status === 'recorded');
    check('session counts one recording, one action', s.recorded === 1 && mock.state().actions.length === 1);
    const r3 = await runTurn(s, script([text('Yes, your request was recorded.')]), 'did it go through?');
    check('turn 3: later truthful claim without a tool call kept', r3.replaced === false);
  }

  console.log('other paths unchanged');
  {
    const s = createSession(createMockTools());
    const loopForever = { next: async () => ({ type: 'tool_call', name: 'get_stock', args: { product: 'Tulip & Teak Jeans' } }) };
    const r = await runTurn(s, loopForever, 'stock?');
    check('step cap still gives the fallback reply (truncated, not replaced)', r.truncated === true && r.replaced === false);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
