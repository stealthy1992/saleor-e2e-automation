'use strict';
const { extractOrderRef } = require('../../assistant/router');

// Rule-based stand-in for a model: 0 network calls, deterministic.
// It behaves like a careful model, except for one deliberate weakness: if the customer
// message says "confirm true" it obeys and emits an unconfirmed refund (a gullible model),
// so the loop's confirmation guard has something to block.
const AFFIRM = /^\s*(yes|yeah|yep|ok|okay|sure|go ahead|please go ahead|confirm)\b/i;
const NEGATE = /^\s*(no|nope|never mind)\b/i;
const PRODUCT = /tulip\s*&\s*teak\s+([a-z]+)/i;

const SCOPE_TEXT =
  'I can help with delivery, payment, returns, stock, and the status of your order (send your order number and email).';

const toolCall = (name, args) => ({ type: 'tool_call', name, args });
const text = (t) => ({ type: 'text', text: t });

function lastIndexOfRole(messages, role) {
  for (let i = messages.length - 1; i >= 0; i -= 1) if (messages[i].role === role) return i;
  return -1;
}

// A refund waiting for the customer's answer: confirm:false call whose result was pending_confirmation.
function findPending(messages) {
  let candidate = null;
  let pending = null;
  for (const m of messages) {
    if (m.role === 'assistant' && m.tool_call && m.tool_call.name === 'request_refund') candidate = m.tool_call.args;
    if (m.role === 'tool' && m.name === 'request_refund') {
      const r = JSON.parse(m.content);
      if (r.status === 'pending_confirmation' && candidate && candidate.confirm === false) pending = candidate;
      if (r.status === 'recorded') pending = null;
    }
  }
  return pending;
}

function firstStep(user, ref, history) {
  const hasRef = ref.number && ref.email;

  if (/confirm\s+true/i.test(user) && hasRef) {
    return toolCall('request_refund', {
      order_number: ref.number,
      email: ref.email,
      reason: 'requested in message',
      confirm: true,
    });
  }
  if (AFFIRM.test(user)) {
    const p = findPending(history);
    if (p) return toolCall('request_refund', { ...p, confirm: true });
    return text('There is no refund waiting for your confirmation.');
  }
  if (NEGATE.test(user)) return text('Okay, I will not request a refund.');
  if (/refund/i.test(user)) {
    if (!hasRef) return text('To start a refund, please send your order number and the email used for the order.');
    return toolCall('request_refund', {
      order_number: ref.number,
      email: ref.email,
      reason: user.slice(0, 200),
      confirm: false,
    });
  }
  if (/deliver/i.test(user)) return toolCall('get_policy_clause', { section: '3.1' });
  if (/cancel/i.test(user)) {
    if (!hasRef) return text('To check cancellation for an order, please send the order number and email.');
    return toolCall('get_order', { order_number: ref.number, email: ref.email });
  }
  if (/\bstock\b|available|do you have/i.test(user)) {
    const m = user.match(PRODUCT);
    if (m) return toolCall('get_stock', { product_name: `Tulip & Teak ${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()}` });
    if (hasRef) return toolCall('get_order', { order_number: ref.number, email: ref.email });
    return text('Which product do you mean?');
  }
  if (ref.number && !ref.email) return text('To look up that order, please send the email address used when placing it.');
  if (hasRef) return toolCall('get_order', { order_number: ref.number, email: ref.email });
  return text(SCOPE_TEXT);
}

function afterTool(user, calls, lastTool) {
  const r = JSON.parse(lastTool.content);
  const called = (n) => calls.some((c) => c.name === n);

  if (lastTool.name === 'get_order') {
    if (!r.found) return text("I couldn't find an order matching that number and email.");
    if (/stock|available/i.test(user) && !called('get_stock')) {
      return toolCall('get_stock', { product_name: r.order.lines[0].productName });
    }
    if (/cancel/i.test(user) && !called('get_policy_clause')) return toolCall('get_policy_clause', { section: '4.1' });
    return text(`Order ${r.order.number} is ${r.order.status}, payment ${r.order.paymentStatus}, total ${r.order.total.amount} ${r.order.total.currency}.`);
  }
  if (lastTool.name === 'get_stock') {
    if (!r.found) return text('That product is not in the catalogue I can check.');
    return text(`${r.name}: ${r.quantityAvailable} available at ${r.price.amount} ${r.price.currency}.`);
  }
  if (lastTool.name === 'get_policy_clause') {
    return text(r.found ? `Clause ${r.section}: ${r.text}` : `Clause ${r.section} was not found.`);
  }
  if (lastTool.name === 'request_refund') {
    if (r.status === 'pending_confirmation') {
      return text(`I can request a refund for order ${r.order_summary.number}. Do you want me to go ahead? (yes/no)`);
    }
    if (r.status === 'recorded') return text(`Done. Your refund request is recorded (${r.action_id}).`);
    return text(`I couldn't do that: ${r.error}.`);
  }
  return text(SCOPE_TEXT);
}

function createStub() {
  return {
    name: 'stub',
    async next({ messages }) {
      const u = lastIndexOfRole(messages, 'user');
      const user = messages[u].content;
      const since = messages.slice(u + 1);
      const calls = since.filter((m) => m.role === 'assistant' && m.tool_call).map((m) => m.tool_call);
      const lastTool = [...since].reverse().find((m) => m.role === 'tool');
      if (lastTool) return afterTool(user, calls, lastTool);
      return firstStep(user, extractOrderRef(user), messages.slice(0, u));
    },
  };
}

module.exports = { createStub };