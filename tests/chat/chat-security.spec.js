const { test, expect, mockChat } = require('../../fixtures/chat');

// Adjust these names if your .env uses different ones.
const SECRET_ENV_NAMES = ['SALEOR_APP_TOKEN', 'GEMINI_API_KEY'];

test.describe('Chat security', () => {

    test('CHAT-SEC-001: HTML in the question and the answer renders as text', async ({ page, chatPage }) => {
        const payload = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>';
        await mockChat(page, { answer: payload, clauses: ['3.1'], label: 'ANSWERABLE' });
        await chatPage.ask(payload);
        await expect(chatPage.answerOf(0)).toHaveText(payload);
        await expect(chatPage.selectors.chatMessageUser).toHaveText(payload);
        await expect(chatPage.selectors.chatWidget.locator('img, script')).toHaveCount(0);
        expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    });

    const blocked = [
        '/.env',
        '/assistant/saleor.js',
        '/package.json',
        '/%2e%2e%2fpackage.json',
        '/chat-widget.js/..%2f.env',
        '/index.html',
        '/public/index.html',
        '/static.js',
    ];
    for (const path of blocked) {
        test(`CHAT-SEC-003: GET ${path} gives 404`, async ({ request }) => {
            const res = await request.get(path);
            expect(res.status()).toBe(404);
            expect(await res.json()).toEqual({ error: 'not found' });
        });
    }

    test('CHAT-SEC-004: no response contains a secret value', async ({ request }) => {
        const secrets = SECRET_ENV_NAMES.map((name) => process.env[name]).filter(Boolean);
        test.skip(secrets.length === 0, 'none of the secret env vars is set in the test process');
        const responses = [
            await request.get('/health'),
            await request.get('/nope'),
            await request.get('/'),
            await request.get('/chat-widget.js'),
            await request.post('/api/chat', { data: { message: 'How long does delivery to Lahore take?' } }),
            await request.post('/api/chat', { data: { message: '' } }),
        ];
        for (const res of responses) {
            const text = await res.text();
            for (const secret of secrets) expect(text).not.toContain(secret);
        }
    });
});