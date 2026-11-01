'use strict';
// Offline check for P3a (refund eligibility). No server, no database, no model: 0 Gemini requests.
//   node agent/check-refund-eligibility.js
const { refundBlockedReason } = require('./tools');
const { createMockTools } = require('./mock-tools');
const { createSaleorTools } = require('./saleor-tools');

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
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const REFUND = { order_number: '1004', email: 'noor.a@example.com', reason: 'changed my mind' };
const refundedFacts = {
  number: '1004', status: 'FULFILLED', paymentStatus: 'FULLY_REFUNDED', chargeStatus: 'NONE',
  total: { amount: 3000, currency: 'PKR' }, shippingPrice: { amount: 0, currency: 'PKR' },
  lines: [{ productName: 'Tulip & Teak Jeans', quantity: 1 }],
};

async function main() {
  console.log('helper');
  check('FULLY_REFUNDED -> already_refunded', refundBlockedReason({ paymentStatus: 'FULLY_REFUNDED' }) === 'already_refunded');
  for (const s of ['NOT_CHARGED', 'FULLY_CHARGED', 'PARTIALLY_CHARGED', 'PARTIALLY_REFUNDED', 'PENDING', undefined]) {
    check(`${s} -> null (not decided here)`, refundBlockedReason({ paymentStatus: s }) === null);
  }
  check('missing facts -> null', refundBlockedReason(null) === null && refundBlockedReason(undefined) === null);

  console.log('mock backend (injected FULLY_REFUNDED fixture; default fixtures untouched)');
  const orders = { '1004': { email: 'noor.a@example.com', facts: refundedFacts } };
  const mock = createMockTools({ orders });
  const r1 = mock.call('request_refund', { ...REFUND, confirm: false });
  check('confirm:false is rejected as already_refunded', r1.ok && same(r1.result, { status: 'rejected', error: 'already_refunded' }), JSON.stringify(r1));
  check('no pending and no action created', same(mock.state(), { pending: 0, actions: [] }), JSON.stringify(mock.state()));
  const r2 = mock.call('request_refund', { ...REFUND, confirm: true });
  check('confirm:true is rejected the same way', r2.ok && r2.result.error === 'already_refunded', JSON.stringify(r2));
  const g = mock.call('get_order', { order_number: '1004', email: 'noor.a@example.com' });
  check('get_order still returns the order (reads are unaffected)', g.ok && g.result.found === true && g.result.order.paymentStatus === 'FULLY_REFUNDED');
  const def = createMockTools();
  const d1 = def.call('request_refund', { order_number: '1002', email: 'sara.k@example.com', reason: 'item arrived damaged', confirm: false });
  check('default fixture 1002 still gets pending_confirmation', d1.ok && d1.result.status === 'pending_confirmation', JSON.stringify(d1));
  const d2 = def.call('request_refund', { order_number: '1002', email: 'sara.k@example.com', reason: 'item arrived damaged', confirm: true });
  check('default fixture 1002 still records on confirm:true', d2.ok && d2.result.status === 'recorded', JSON.stringify(d2));
  const d3 = def.call('request_refund', { order_number: '9999', email: 'sara.k@example.com', reason: 'item arrived damaged', confirm: false });
  check('unknown order is still order_not_found', d3.ok && d3.result.error === 'order_not_found');

  console.log('saleor backend (fake saleor client and fake database)');
  const sql = [];
  const db = { query: async (text, params) => { sql.push({ text, params }); return []; } };
  const inserts = () => sql.filter((q) => /INSERT INTO agent_actions/.test(q.text)).length;
  let node = { ...refundedFacts, userEmail: 'noor.a@example.com' };
  const saleor = { getOrder: async (number, email) => (String(number) === '1004' && email === 'noor.a@example.com' ? node : null) };
  const real = createSaleorTools({ sessionId: 'check-1', saleor, db });
  const s1 = await real.call('request_refund', { ...REFUND, confirm: false });
  check('confirm:false is rejected as already_refunded', s1.ok && same(s1.result, { status: 'rejected', error: 'already_refunded' }), JSON.stringify(s1));
  const st1 = await real.state();
  check('no pending created', st1.pending === 0, JSON.stringify(st1));
  const s2 = await real.call('request_refund', { ...REFUND, confirm: true });
  check('confirm:true is rejected the same way and nothing is inserted', s2.ok && s2.result.error === 'already_refunded' && inserts() === 0, JSON.stringify(s2));

  node = { ...refundedFacts, paymentStatus: 'FULLY_CHARGED', userEmail: 'noor.a@example.com' };
  const real2 = createSaleorTools({ sessionId: 'check-2', saleor, db });
  const e1 = await real2.call('request_refund', { ...REFUND, confirm: false });
  check('eligible order gets pending_confirmation', e1.ok && e1.result.status === 'pending_confirmation', JSON.stringify(e1));
  node = { ...refundedFacts, userEmail: 'noor.a@example.com' }; // the order is refunded between the two messages
  const e2 = await real2.call('request_refund', { ...REFUND, confirm: true });
  check('status changed to FULLY_REFUNDED before confirm: rejected, nothing inserted', e2.ok && e2.result.error === 'already_refunded' && inserts() === 0, JSON.stringify(e2));

  node = { ...refundedFacts, paymentStatus: 'FULLY_CHARGED', userEmail: 'noor.a@example.com' };
  const real3 = createSaleorTools({ sessionId: 'check-3', saleor, db });
  await real3.call('request_refund', { ...REFUND, confirm: false });
  const e3 = await real3.call('request_refund', { ...REFUND, confirm: true });
  check('eligible order still records exactly one row', e3.ok && e3.result.status === 'recorded' && inserts() === 1, JSON.stringify(e3));

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(failed ? 'check: FAILED' : 'check: OK');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
