const { test, expect } = require('@playwright/test');
const { validateChat } = require('../../schemas/chat');

test.describe('Assistant HTTP API (stub provider)', () => {

    test.beforeEach(async ({ request }) => {
        const health = await (await request.get('/health')).json();
        test.skip(health.provider !== 'stub', `needs LLM_PROVIDER=stub, server runs "${health.provider}"`);
    });

    const post = (request, data) => request.post('/api/chat', { data });

    test('CHAT-API-001: delivery question gives ANSWERABLE with clause 3.1', async ({ request }) => {
        const res = await post(request, { message: 'How long does delivery to Lahore take?' });
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(validateChat('chatReply', body).errors).toEqual([]);
        expect(body).toMatchObject({ label: 'ANSWERABLE', clauses: ['3.1'] });
    });

    test('CHAT-API-001: other question gives NOT_COVERED with no clauses', async ({ request }) => {
        const res = await post(request, { message: 'Do you accept crypto?' });
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(validateChat('chatReply', body).errors).toEqual([]);
        expect(body).toMatchObject({ label: 'NOT_COVERED', clauses: [] });
    });

    const badRequests = [
        ['empty message', { message: '' }, '"message" must be a non-empty string'],
        ['whitespace message', { message: '   ' }, '"message" must be a non-empty string'],
        ['missing message', {}, '"message" must be a non-empty string'],
        ['non-string message', { message: 123 }, '"message" must be a non-empty string'],
        ['1001 characters', { message: 'a'.repeat(1001) }, '"message" must be at most 1000 characters'],
    ];
    for (const [name, data, error] of badRequests) {
        test(`CHAT-API-002: ${name} gives 400`, async ({ request }) => {
            const res = await post(request, data);
            expect(res.status()).toBe(400);
            const body = await res.json();
            expect(validateChat('chatError', body).errors).toEqual([]);
            expect(body.error).toBe(error);
        });
    }

    test('CHAT-API-002: exactly 1000 characters is accepted', async ({ request }) => {
        const res = await post(request, { message: 'a'.repeat(1000) });
        expect(res.status()).toBe(200);
        expect(validateChat('chatReply', await res.json()).errors).toEqual([]);
    });

    test('CHAT-API-002: body over 10 KB gives 413', async ({ request }) => {
        const res = await post(request, { message: 'a'.repeat(11000) });
        expect(res.status()).toBe(413);
        expect(await res.json()).toEqual({ error: 'payload too large' });
    });

    test('CHAT-API-002: invalid JSON gives 400', async ({ request }) => {
        const res = await request.post('/api/chat', {
            data: 'not json',
            headers: { 'Content-Type': 'text/plain' },
        });
        expect(res.status()).toBe(400);
        expect(await res.json()).toEqual({ error: 'body must be valid JSON' });
    });
    
    test('CHAT-API-003: GET /api/chat gives 405', async ({ request }) => {
        const res = await request.get('/api/chat');
        expect(res.status()).toBe(405);
        expect(await res.json()).toEqual({ error: 'method not allowed' });
    });

    test('CHAT-API-003: unknown path gives 404', async ({ request }) => {
        const res = await request.get('/nope');
        expect(res.status()).toBe(404);
        expect(await res.json()).toEqual({ error: 'not found' });
    });

    test('CHAT-API-003: /health reports status, provider and model', async ({ request }) => {
        const res = await request.get('/health');
        expect(res.status()).toBe(200);
        expect(await res.json()).toEqual({ status: 'ok', provider: 'stub', model: 'stub' });
    });
});