const crypto = require('crypto');
const { test, expect } = require('@playwright/test');

// Runs only when the agent was started with AGENT_BACKEND=saleor (stub provider, 0 Gemini requests):
//   $env:AGENT_BACKEND = "saleor"; npm run agent
//   npx playwright test tests/agent/agent-saleor.spec.js --project=agent
// Test data is discovered at run time from Saleor's own tables (no seeding, nothing in Saleor is changed).
// The only thing these tests write is rows in agent_actions, removed in afterAll.
test.describe('Agent HTTP API (stub provider, saleor backend)', () => {
    let query = null;
    let loaded = false;
    let order = null;       // { number, user_email, status, charge_status }; number >= 100 because the tool schema only accepts 3 to 10 digits
    let productName = null; // a single-word "Tulip & Teak X" product, because the stub reads one word

    test.beforeEach(async ({ request }) => {
        let health = { provider: 'unreachable', backend: 'unreachable' };
        try {
            health = await (await request.get('/health')).json();
        } catch (err) {
            // agent not listening: fall through and skip with the message below
        }
        test.skip(health.provider !== 'stub' || health.backend !== 'saleor',
            `needs AGENT_PROVIDER=stub and AGENT_BACKEND=saleor, server runs "${health.provider}/${health.backend}"`);

        if (!loaded) {
            ({ query } = require('../../utils/db-client'));
            const o = await query(
                `SELECT number, user_email, status, charge_status FROM order_order
                  WHERE user_email <> '' AND status = 'unfulfilled' AND number >= 100 ORDER BY number ASC LIMIT 1`);
            const p = await query(
                `SELECT name FROM product_product WHERE name ~ '^Tulip & Teak [A-Z][a-z]+$' ORDER BY name LIMIT 1`);
            order = o[0] || null;
            productName = p[0] ? p[0].name : null;
            loaded = true;
        }
    });

    test.afterAll(async () => {
        if (query) await query(`DELETE FROM agent_actions WHERE session_id LIKE 'pw-saleor-%'`);
    });

    const newSession = () => `pw-saleor-${crypto.randomUUID()}`;
    const say = async (request, session_id, message) => {
        const res = await request.post('/api/agent', { data: { session_id, message } });
        expect(res.status()).toBe(200);
        return res.json();
    };
    const state = async (request, session_id) => {
        const res = await request.get(`/api/agent/state?session_id=${session_id}`);
        expect(res.status()).toBe(200);
        return res.json();
    };
    const dbActions = (session_id) => query(
        'SELECT action_id, order_number, email, reason, status FROM agent_actions WHERE session_id = $1 ORDER BY id',
        [session_id]);
    const needOrder = () => test.skip(!order, 'no unfulfilled order with an email found in order_order');
    const refundMessage = () => `I want a refund for order ${order.number}, email ${order.user_email}. The item arrived damaged.`;

    test('AGENT-SALEOR-001: /health reports the saleor backend', async ({ request }) => {
        const res = await request.get('/health');
        expect(res.status()).toBe(200);
        expect(await res.json()).toEqual({ status: 'ok', provider: 'stub', backend: 'saleor' });
    });

    test('AGENT-SALEOR-002: delivery question returns clause 3.1 from the Saleor policy page', async ({ request }) => {
        const body = await say(request, newSession(), 'How long does delivery to Lahore take?');
        expect(body.trace).toHaveLength(1);
        expect(body.trace[0]).toMatchObject({ tool: 'get_policy_clause', args: { section: '3.1' }, status: 'ok' });
        expect(body.trace[0].result.found).toBe(true);
        expect(body.trace[0].result.text).toMatch(/working days/);
        expect(body.trace[0].result.text.startsWith('3.1')).toBe(false);
        expect(body.model_calls).toBe(2);
    });

    test('AGENT-SALEOR-003: real order with its email matches the database row', async ({ request }) => {
        needOrder();
        const body = await say(request, newSession(),
            `What is the status of order ${order.number}? My email is ${order.user_email}`);
        expect(body.trace).toHaveLength(1);
        expect(body.trace[0]).toMatchObject({ tool: 'get_order', status: 'ok' });
        expect(body.trace[0].args.order_number).toBe(String(order.number));
        const r = body.trace[0].result;
        expect(r.found).toBe(true);
        expect(r.order.number).toBe(String(order.number));
        expect(r.order.status).toBe(order.status.toUpperCase());
        expect(r.order.chargeStatus).toBe(order.charge_status.toUpperCase());
        expect(typeof r.order.total.amount).toBe('number');
        expect(typeof r.order.total.currency).toBe('string');
        expect(r.order).not.toHaveProperty('userEmail');
        expect(body.reply).toContain(order.status.toUpperCase());
    });

    test('AGENT-SALEOR-003: wrong email gives found:false and records nothing', async ({ request }) => {
        needOrder();
        const sid = newSession();
        const body = await say(request, sid, `Check order ${order.number}, my email is wrong@example.com`);
        expect(body.trace).toHaveLength(1);
        expect(body.trace[0].result).toEqual({ found: false });
        expect(await dbActions(sid)).toEqual([]);
    });

    test('AGENT-SALEOR-004: stock question returns a real product', async ({ request }) => {
        test.skip(!productName, 'no single-word "Tulip & Teak X" product found in product_product');
        const body = await say(request, newSession(), `Do you have the ${productName} in stock?`);
        expect(body.trace).toHaveLength(1);
        expect(body.trace[0]).toMatchObject({ tool: 'get_stock', args: { product_name: productName }, status: 'ok' });
        const r = body.trace[0].result;
        expect(r.found).toBe(true);
        expect(r.name).toBe(productName);
        expect(Number.isInteger(r.quantityAvailable)).toBe(true);
        expect(r.quantityAvailable).toBeGreaterThanOrEqual(0);
        expect(r.price === null || (typeof r.price.amount === 'number' && typeof r.price.currency === 'string')).toBe(true);
    });

    test('AGENT-SALEOR-005: refund request is pending and records nothing', async ({ request }) => {
        needOrder();
        const sid = newSession();
        const body = await say(request, sid, refundMessage());
        expect(body.trace).toHaveLength(1);
        expect(body.trace[0]).toMatchObject({ tool: 'request_refund', args: { confirm: false }, status: 'ok' });
        expect(body.trace[0].result.status).toBe('pending_confirmation');
        expect(await dbActions(sid)).toEqual([]);
        expect(await state(request, sid)).toMatchObject({ actions: [], pending: 1, turns: 1 });
    });

    test('AGENT-SALEOR-005: confirmation in the next message records exactly one row and changes nothing in Saleor', async ({ request }) => {
        needOrder();
        const sid = newSession();
        await say(request, sid, refundMessage());
        const body = await say(request, sid, 'Yes, please go ahead.');
        expect(body.trace[0]).toMatchObject({ tool: 'request_refund', args: { confirm: true }, status: 'ok' });
        expect(body.trace[0].result.status).toBe('recorded');

        const rows = await dbActions(sid);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            action_id: body.trace[0].result.action_id,
            order_number: String(order.number),
            email: order.user_email.toLowerCase(),
            status: 'refund_requested',
        });
        expect(body.reply).toContain(rows[0].action_id);

        const s = await state(request, sid);
        expect(s.pending).toBe(0);
        expect(s.actions).toEqual(rows);

        const after = await query('SELECT status, charge_status FROM order_order WHERE number = $1', [order.number]);
        expect(after[0]).toEqual({ status: order.status, charge_status: order.charge_status });
    });

    test('AGENT-SALEOR-006: stale confirmation (two messages later) is blocked', async ({ request }) => {
        needOrder();
        const sid = newSession();
        await say(request, sid, refundMessage());
        await say(request, sid, 'How long does delivery take?');
        const body = await say(request, sid, 'Yes');
        expect(body.trace[0]).toMatchObject({ tool: 'request_refund', args: { confirm: true }, status: 'blocked' });
        expect(await dbActions(sid)).toEqual([]);
    });

    test('AGENT-SALEOR-006: sessions are isolated', async ({ request }) => {
        needOrder();
        const a = newSession();
        const b = newSession();
        await say(request, a, refundMessage());                        // a: refund waiting for confirmation
        const body = await say(request, b, 'Yes, please go ahead.');   // b: a "yes" with nothing pending in b
        expect(body.trace).toEqual([]);
        expect(await state(request, a)).toMatchObject({ pending: 1, actions: [] });  // a is untouched
        expect(await state(request, b)).toMatchObject({ pending: 0, actions: [] });  // b never inherited a's pending
        expect(await dbActions(a)).toEqual([]);
        expect(await dbActions(b)).toEqual([]);
    });

    test('AGENT-SALEOR-007: refund for an order that does not exist is rejected', async ({ request }) => {
        needOrder();
        const sid = newSession();
        const body = await say(request, sid,
            `Please refund order 99999999. My email is ${order.user_email} and the item arrived damaged.`);
        expect(body.trace).toHaveLength(1);
        expect(body.trace[0].result).toEqual({ status: 'rejected', error: 'order_not_found' });
        expect(await dbActions(sid)).toEqual([]);
    });
});
