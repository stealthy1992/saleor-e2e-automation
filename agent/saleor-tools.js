'use strict';
const crypto = require('crypto');
const { TOOL_BY_NAME, validateArgs } = require('./tools');

// Real backend (AGENT_BACKEND=saleor). Same interface as mock-tools.js: call(name, args) and state(),
// but both return Promises. Reads come from Saleor (assistant/saleor.js). The only thing it ever
// WRITES is a row in the Postgres table agent_actions: it never changes anything inside Saleor.

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS agent_actions (
  id           BIGSERIAL PRIMARY KEY,
  action_id    TEXT        NOT NULL UNIQUE,
  session_id   TEXT        NOT NULL,
  order_number TEXT        NOT NULL,
  email        TEXT        NOT NULL,
  reason       TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'refund_requested',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
)`;
const CREATE_INDEX_SQL = 'CREATE INDEX IF NOT EXISTS agent_actions_session_idx ON agent_actions (session_id)';

// Run once at server start.
async function initSaleorBackend(db) {
  await db.query(CREATE_TABLE_SQL);
  await db.query(CREATE_INDEX_SQL);
}

const money = (m) => (m ? { amount: Number(m.amount), currency: m.currency } : null);

// Saleor order node -> the shape mock-tools.js returns, so the model and the specs see one contract.
// userEmail and channel are deliberately left out.
function toOrderFacts(node) {
  return {
    number: String(node.number),
    status: node.status,
    paymentStatus: node.paymentStatus,
    chargeStatus: node.chargeStatus,
    total: money(node.total && node.total.gross),
    shippingPrice: money(node.shippingPrice && node.shippingPrice.gross),
    lines: (node.lines || []).map((l) => ({ productName: l.productName, quantity: l.quantity })),
  };
}

// Product node -> { name, quantityAvailable, price }. A product has variants:
// quantity = sum over variants (missing = 0), price = the lowest variant price.
function toStockFacts(node) {
  const variants = node.variants || [];
  const quantityAvailable = variants.reduce((sum, v) => sum + (v.quantityAvailable || 0), 0);
  const prices = variants
    .map((v) => v.pricing && v.pricing.price && v.pricing.price.gross)
    .filter(Boolean)
    .map(money);
  const price = prices.length ? prices.reduce((a, b) => (b.amount < a.amount ? b : a)) : null;
  return { name: node.name, quantityAvailable, price };
}

// Policy page text -> text of one clause. Clause lines look like "3.1 Delivery takes ...".
// Headers ("## 3. Delivery") and the title lines do not match, so they are never returned.
function extractClause(policyText, section) {
  for (const line of policyText.split('\n')) {
    const m = line.match(/^(\d+\.\d+)\s+(.*)$/);
    if (m && m[1] === section) return m[2].trim();
  }
  return null;
}

// One instance per session (the id is stored with every recorded refund).
function createSaleorTools({ sessionId, saleor, db }) {
  const pending = new Map(); // "number|email" -> { action_id, reason }  (in memory, like the mock)

  const handlers = {
    async get_order({ order_number, email }) {
      const node = await saleor.getOrder(order_number, email);
      return node ? { found: true, order: toOrderFacts(node) } : { found: false };
    },

    async get_stock({ product_name }) {
      const node = await saleor.getProductByName(product_name.trim());
      return node ? { found: true, ...toStockFacts(node) } : { found: false };
    },

    async get_policy_clause({ section }) {
      const text = extractClause(await saleor.getPolicyText(), section);
      return text ? { found: true, section, text } : { found: false, section };
    },

    async request_refund({ order_number, email, reason, confirm }) {
      const node = await saleor.getOrder(order_number, email);
      if (!node) return { status: 'rejected', error: 'order_not_found' };
      const facts = toOrderFacts(node);
      const key = `${order_number}|${email.trim().toLowerCase()}`;

      if (!confirm) {
        const action_id = `act-${crypto.randomUUID()}`;
        pending.set(key, { action_id, reason });
        return {
          status: 'pending_confirmation',
          action_id,
          order_summary: { number: facts.number, status: facts.status, total: facts.total, lines: facts.lines },
          message: 'Nothing has been requested yet. Ask the customer to confirm.',
        };
      }

      const p = pending.get(key);
      if (!p) return { status: 'rejected', error: 'no_pending_confirmation' };
      await db.query(
        `INSERT INTO agent_actions (action_id, session_id, order_number, email, reason, status)
         VALUES ($1, $2, $3, $4, $5, 'refund_requested')
         ON CONFLICT (action_id) DO NOTHING`,
        [p.action_id, sessionId, String(order_number), email.trim().toLowerCase(), reason]
      );
      pending.delete(key);
      return { status: 'recorded', action_id: p.action_id };
    },
  };

  async function call(name, args) {
    if (!TOOL_BY_NAME[name]) return { ok: false, error: 'unknown_tool' };
    const check = validateArgs(name, args);
    if (!check.valid) return { ok: false, error: 'invalid_arguments', details: check.errors };
    return { ok: true, result: await handlers[name](args) };
  }

  async function state() {
    const rows = await db.query(
      `SELECT action_id, order_number, email, reason, status
         FROM agent_actions WHERE session_id = $1 ORDER BY id`,
      [sessionId]
    );
    return { pending: pending.size, actions: rows };
  }

  return { call, state };
}

module.exports = { createSaleorTools, initSaleorBackend, extractClause, toOrderFacts, toStockFacts };
