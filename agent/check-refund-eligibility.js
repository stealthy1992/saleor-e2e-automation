'use strict';
// Offline check for P3a + P3e (refund eligibility). No server, no database, no model: 0 Gemini requests.
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
// Nothing charged on an order that has not shipped: rule 2 (not_paid) applies.
const unpaidFacts = { ...refundedFacts, status: 'UNFULFILLED', paymentStatus: 'NOT_CHARGED', chargeStatus: 'NONE' };
// Delivered, no charge recorded (cash on delivery, courier has not handed the cash over): decision 15 option B allows it.
const codDeliveredFacts = { ...refundedFacts, status: 'FULFILLED', paymentStatus: 'NOT_CHARGED', chargeStatus: 'NONE' };

async function main() {
  console.log('helper: rule 1 (already_refunded)');
  check('FULLY_REFUNDED -> already_refunded', refundBlockedReason({ paymentStatus: 'FULLY_REFUNDED' }) === 'already_refunded');
  check('FULLY_REFUNDED wins over rule 2 (unfulfilled, chargeStatus NONE)',
    refundBlockedReason({ status: 'UNFULFILLED', paymentStatus: 'FULLY_REFUNDED', chargeStatus: 'NONE' }) === 'already_refunded');

  console.log('helper: rule 2 (not_paid) = unpaid paymentStatus AND chargeStatus NONE AND status UNFULFILLED');
  for (const s of ['NOT_CHARGED', 'PENDING', 'REFUSED', 'CANCELLED']) {
    check(`UNFULFILLED + ${s} + NONE -> not_paid`,
      refundBlockedReason({ status: 'UNFULFILLED', paymentStatus: s, chargeStatus: 'NONE' }) === 'not_paid');
  }
  for (const st of ['FULFILLED', 'PARTIALLY_FULFILLED', 'CANCELED', 'RETURNED', 'DRAFT', 'UNCONFIRMED', 'EXPIRED', undefined]) {
    check(`${st} + NOT_CHARGED + NONE -> null (status is not UNFULFILLED)`,
      refundBlockedReason({ status: st, paymentStatus: 'NOT_CHARGED', chargeStatus: 'NONE' }) === null);
  }
  for (const c of ['PARTIAL', 'FULL', 'OVERCHARGED', undefined]) {
    check(`UNFULFILLED + NOT_CHARGED + chargeStatus ${c} -> null (something was charged or unknown)`,
      refundBlockedReason({ status: 'UNFULFILLED', paymentStatus: 'NOT_CHARGED', chargeStatus: c }) === null);
  }
  for (const p of ['FULLY_CHARGED', 'PARTIALLY_CHARGED', 'PARTIALLY_REFUNDED', undefined]) {
    check(`UNFULFILLED + ${p} + NONE -> null (paymentStatus not in the unpaid set)`,
      refundBlockedReason({ status: 'UNFULFILLED', paymentStatus: p, chargeStatus: 'NONE' }) === null);
  }
  check('paymentStatus alone (no status, no chargeStatus) -> null',
    refundBlockedReason({ paymentStatus: 'NOT_CHARGED' }) === null);
  check('missing facts -> null', refundBlockedReason(null) === null && refundBlockedReason(undefined) === null);

  console.log('mock backend (injected fixtures; default fixtures untouched)');
  const orders = {
    '1004': { email: 'noor.a@example.com', facts: refundedFacts },
    '1005': { email: 'noor.a@example.com', facts: { ...unpaidFacts, number: '1005' } },
    '1006': { email: 'noor.a@example.com', facts: { ...codDeliveredFacts, number: '1006' } },
  };
  const mock = createMockTools({ orders });
  const r1 = mock.call('request_refund', { ...REFUND, confirm: false });
  check('already refunded: confirm:false is rejected as already_refunded', r1.ok && same(r1.result, { status: 'rejected', error: 'already_refunded' }), JSON.stringify(r1));
  check('no pending and no action created', same(mock.state(), { pending: 0, actions: [] }), JSON.stringify(mock.state()));
  const r2 = mock.call('request_refund', { ...REFUND, confirm: true });
  check('already refunded: confirm:true is rejected the same way', r2.ok && r2.result.error === 'already_refunded', JSON.stringify(r2));
  const g = mock.call('get_order', { order_number: '1004', email: 'noor.a@example.com' });
  check('get_order still returns the order (reads are unaffected)', g.ok && g.result.found === true && g.result.order.paymentStatus === 'FULLY_REFUNDED');

  const n1 = mock.call('request_refund', { ...REFUND, order_number: '1005', confirm: false });
  check('unpaid unfulfilled: confirm:false is rejected as not_paid', n1.ok && same(n1.result, { status: 'rejected', error: 'not_paid' }), JSON.stringify(n1));
  check('still no pending and no action', same(mock.state(), { pending: 0, actions: [] }), JSON.stringify(mock.state()));
  const n2 = mock.call('request_refund', { ...REFUND, order_number: '1005', confirm: true });
  check('unpaid unfulfilled: confirm:true is rejected the same way', n2.ok && n2.result.error === 'not_paid', JSON.stringify(n2));
  const n3 = mock.call('get_order', { order_number: '1005', email: 'noor.a@example.com' });
  check('get_order still returns the unpaid order', n3.ok && n3.result.found === true && n3.result.order.chargeStatus === 'NONE');

  const c1 = mock.call('request_refund', { ...REFUND, order_number: '1006', confirm: false });
  check('delivered, no charge recorded (COD): confirm:false gets pending_confirmation', c1.ok && c1.result.status === 'pending_confirmation', JSON.stringify(c1));
  const c2 = mock.call('request_refund', { ...REFUND, order_number: '1006', confirm: true });
  check('delivered, no charge recorded (COD): confirm:true records', c2.ok && c2.result.status === 'recorded', JSON.stringify(c2));

  const def = createMockTools();
  const d1 = def.call('request_refund', { order_number: '1002', email: 'sara.k@example.com', reason: 'item arrived damaged', confirm: false });
  check('default fixture 1002 (charged) still gets pending_confirmation', d1.ok && d1.result.status === 'pending_confirmation', JSON.stringify(d1));
  const d2 = def.call('request_refund', { order_number: '1002', email: 'sara.k@example.com', reason: 'item arrived damaged', confirm: true });
  check('default fixture 1002 still records on confirm:true', d2.ok && d2.result.status === 'recorded', JSON.stringify(d2));
  const d3 = def.call('request_refund', { order_number: '9999', email: 'sara.k@example.com', reason: 'item arrived damaged', confirm: false });
  check('unknown order is still order_not_found', d3.ok && d3.result.error === 'order_not_found');
  const d4 = def.call('request_refund', { order_number: '1001', email: 'amir.jee@example.com', reason: 'wrong size', confirm: false });
  check('default fixture 1001 (unfulfilled, uncharged) is now rejected as not_paid', d4.ok && same(d4.result, { status: 'rejected', error: 'not_paid' }), JSON.stringify(d4));
  const d5 = def.call('request_refund', { order_number: '1003', email: 'bilal.m@example.com', reason: 'wrong size', confirm: false });
  check('default fixture 1003 (unfulfilled, uncharged) is now rejected as not_paid', d5.ok && d5.result.error === 'not_paid', JSON.stringify(d5));

  console.log('saleor backend (fake saleor client and fake database)');
  const sql = [];
  const db = { query: async (text, params) => { sql.push({ text, params }); return []; } };
  const inserts = () => sql.filter((q) => /INSERT INTO agent_actions/.test(q.text)).length;
  let node = { ...refundedFacts, userEmail: 'noor.a@example.com' };
  const saleor = { getOrder: async (number, email) => (String(number) === '1004' && email === 'noor.a@example.com' ? node : null) };
  const real = createSaleorTools({ sessionId: 'check-1', saleor, db });
  const s1 = await real.call('request_refund', { ...REFUND, confirm: false });
  check('already refunded: confirm:false is rejected as already_refunded', s1.ok && same(s1.result, { status: 'rejected', error: 'already_refunded' }), JSON.stringify(s1));
  const st1 = await real.state();
  check('no pending created', st1.pending === 0, JSON.stringify(st1));
  const s2 = await real.call('request_refund', { ...REFUND, confirm: true });
  check('already refunded: confirm:true is rejected the same way and nothing is inserted', s2.ok && s2.result.error === 'already_refunded' && inserts() === 0, JSON.stringify(s2));

  node = { ...unpaidFacts, userEmail: 'noor.a@example.com' };
  const realU = createSaleorTools({ sessionId: 'check-u', saleor, db });
  const u1 = await realU.call('request_refund', { ...REFUND, confirm: false });
  check('unpaid unfulfilled: confirm:false is rejected as not_paid', u1.ok && same(u1.result, { status: 'rejected', error: 'not_paid' }), JSON.stringify(u1));
  const stU = await realU.state();
  check('unpaid: no pending created', stU.pending === 0, JSON.stringify(stU));
  const u2 = await realU.call('request_refund', { ...REFUND, confirm: true });
  check('unpaid: confirm:true is rejected the same way and nothing is inserted', u2.ok && u2.result.error === 'not_paid' && inserts() === 0, JSON.stringify(u2));

  node = { ...codDeliveredFacts, userEmail: 'noor.a@example.com' };
  const realC = createSaleorTools({ sessionId: 'check-c', saleor, db });
  const c3 = await realC.call('request_refund', { ...REFUND, confirm: false });
  check('delivered, no charge recorded (COD): gets pending_confirmation', c3.ok && c3.result.status === 'pending_confirmation', JSON.stringify(c3));
  const c4 = await realC.call('request_refund', { ...REFUND, confirm: true });
  check('delivered, no charge recorded (COD): records exactly one row', c4.ok && c4.result.status === 'recorded' && inserts() === 1, JSON.stringify(c4));

  node = { ...refundedFacts, paymentStatus: 'FULLY_CHARGED', chargeStatus: 'FULL', userEmail: 'noor.a@example.com' };
  const real2 = createSaleorTools({ sessionId: 'check-2', saleor, db });
  const e1 = await real2.call('request_refund', { ...REFUND, confirm: false });
  check('eligible order gets pending_confirmation', e1.ok && e1.result.status === 'pending_confirmation', JSON.stringify(e1));
  node = { ...refundedFacts, userEmail: 'noor.a@example.com' }; // the order is refunded between the two messages
  const before = inserts();
  const e2 = await real2.call('request_refund', { ...REFUND, confirm: true });
  check('status changed to FULLY_REFUNDED before confirm: rejected, nothing inserted', e2.ok && e2.result.error === 'already_refunded' && inserts() === before, JSON.stringify(e2));

  node = { ...refundedFacts, paymentStatus: 'FULLY_CHARGED', chargeStatus: 'FULL', userEmail: 'noor.a@example.com' };
  const real3 = createSaleorTools({ sessionId: 'check-3', saleor, db });
  const base = inserts();
  await real3.call('request_refund', { ...REFUND, confirm: false });
  const e3 = await real3.call('request_refund', { ...REFUND, confirm: true });
  check('eligible order still records exactly one row', e3.ok && e3.result.status === 'recorded' && inserts() === base + 1, JSON.stringify(e3));

  node = { ...refundedFacts, paymentStatus: 'FULLY_CHARGED', chargeStatus: 'FULL', userEmail: 'noor.a@example.com' };
  const real4 = createSaleorTools({ sessionId: 'check-4', saleor, db });
  await real4.call('request_refund', { ...REFUND, confirm: false });
  node = { ...unpaidFacts, userEmail: 'noor.a@example.com' }; // the charge disappears and the order is unfulfilled between the two messages
  const base4 = inserts();
  const e4 = await real4.call('request_refund', { ...REFUND, confirm: true });
  check('became unpaid and unfulfilled before confirm: rejected as not_paid, nothing inserted', e4.ok && e4.result.error === 'not_paid' && inserts() === base4, JSON.stringify(e4));

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(failed ? 'check: FAILED' : 'check: OK');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
