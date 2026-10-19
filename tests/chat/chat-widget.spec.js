const { test, expect, mockChat, REPLIES } = require('../../fixtures/chat');

const QUESTION = 'Do you accept crypto?';
const DELIVERY_QUESTION = 'How long does delivery to Lahore take?';

test.describe('Chat widget (API mocked)', () => {

    test('CHAT-UI-001: widget renders: header, empty message list, input, Send enabled', async ({ chatPage }) => {
        const { chatWidgetHeader, chatMessageList, chatInput, sendButton } = chatPage.selectors;
        await expect(chatWidgetHeader).toHaveText('Tulip & Teak support');
        await expect(chatMessageList).toBeEmpty();
        await expect(chatInput).toBeVisible();
        await expect(chatInput).toHaveValue('');
        await expect(sendButton).toBeEnabled();
    });

    test('CHAT-API-002: invalid JSON gives 400', async ({ request }) => {
        const res = await request.post('/api/chat', {
            data: Buffer.from('not json'),
            headers: { 'Content-Type': 'application/json' },
        });
        expect(res.status()).toBe(400);
        expect(await res.json()).toEqual({ error: 'body must be valid JSON' });
    });

    test('CHAT-UI-003: clauses line shows "Policy clauses: 3.1, 4.1" when present and is absent when []', async ({ page, chatPage }) => {
        await mockChat(page, [REPLIES.conflict, REPLIES.notCovered]);
        await chatPage.ask(QUESTION);
        await expect(chatPage.clausesOf(0)).toHaveText('Policy clauses: 3.1, 4.1');
        await chatPage.ask(QUESTION);
        await expect(chatPage.clausesOf(1)).toHaveCount(0);
    });

    for (const reply of Object.values(REPLIES)) {
        test(`CHAT-UI-004: data-label is ${reply.label}`, async ({ page, chatPage }) => {
            await mockChat(page, reply);
            await chatPage.ask(QUESTION);
            expect(await chatPage.fetchDataLabels()).toEqual([reply.label]);
        });
    }

    test('CHAT-UI-005: blank and whitespace submits send no request', async ({ page, chatPage }) => {
        const calls = await mockChat(page, REPLIES.answerable);
        await chatPage.selectors.sendButton.click();
        await chatPage.selectors.chatInput.fill('   ');
        await chatPage.selectors.sendButton.click();
        await expect(chatPage.selectors.chatMessageUser).toHaveCount(0);
        // A real question afterwards proves nothing was sent earlier.
        await chatPage.ask(QUESTION);
        expect(calls).toEqual([{ message: QUESTION }]);
    });

    test('CHAT-UI-006: pending bubble shows and Send is disabled until the reply arrives', async ({ page, chatPage }) => {
        await mockChat(page, REPLIES.answerable, { delayMs: 1500 });
        await chatPage.send(QUESTION);
        await expect(chatPage.selectors.chatPending).toBeVisible();
        await expect(chatPage.selectors.sendButton).toBeDisabled();
        await expect(chatPage.selectors.chatMessageAssistant).toHaveCount(1);
        await expect(chatPage.selectors.chatPending).toHaveCount(0);
        await expect(chatPage.selectors.sendButton).toBeEnabled();
    });

    test('CHAT-UI-007: request is POST /api/chat with { message } trimmed', async ({ page, chatPage }) => {
        await mockChat(page, REPLIES.notCovered);
        const [request] = await Promise.all([
            page.waitForRequest('**/api/chat'),
            chatPage.send(`  ${QUESTION}  `),
        ]);
        expect(request.method()).toBe('POST');
        expect(request.headers()['content-type']).toContain('application/json');
        expect(request.postDataJSON()).toEqual({ message: QUESTION });
    });

    const failures = [
        ['502 llm_error', { status: 502, body: JSON.stringify({ error: 'llm_error' }) }],
        ['400 bad request', { status: 400, body: JSON.stringify({ error: 'bad request' }) }],
        ['malformed JSON on a 200', { status: 200, body: 'not json' }],
        ['200 without an answer', { status: 200, body: JSON.stringify({}) }],
        ['network failure', { abort: true }],
    ];
    for (const [name, options] of failures) {
        test(`CHAT-UI-008: ${name} shows an error and the widget stays usable`, async ({ page, chatPage }) => {
            await mockChat(page, REPLIES.notCovered, options);
            await chatPage.send(QUESTION);
            await expect(chatPage.selectors.chatError).toHaveText('Something went wrong. Please try again.');
            await expect(chatPage.selectors.chatPending).toHaveCount(0);
            await expect(chatPage.selectors.chatMessageAssistant).toHaveCount(0);
            await expect(chatPage.selectors.sendButton).toBeEnabled();
            // Newest route wins, so this replaces the failing mock.
            await mockChat(page, REPLIES.answerable);
            await chatPage.ask(DELIVERY_QUESTION);
            await expect(chatPage.answerOf(0)).toHaveText(REPLIES.answerable.answer);
        });
    }

    test('CHAT-UI-009: input is capped at 1000 characters', async ({ chatPage }) => {
        // maxlength is checked as an attribute because programmatic fill may bypass it; the server 400 is in chat-api.spec.js.
        await expect(chatPage.selectors.chatInput).toHaveAttribute('maxlength', '1000');
    });

    test('CHAT-UI-010: a second submit while the first is pending sends no request', async ({ page, chatPage }) => {
        const calls = await mockChat(page, REPLIES.answerable, { delayMs: 1500 });
        await chatPage.send('first');
        await expect(chatPage.selectors.chatPending).toBeVisible();
        await chatPage.selectors.chatInput.fill('second');
        await chatPage.selectors.chatForm.evaluate((form) => form.requestSubmit());
        await expect(chatPage.selectors.chatMessageAssistant).toHaveCount(1);
        expect(calls).toEqual([{ message: 'first' }]);
        await expect(chatPage.selectors.chatInput).toHaveValue('second');
    });

    test('CHAT-UI-011: Enter submits and multi-turn keeps order', async ({ page, chatPage }) => {
        const calls = await mockChat(page, [REPLIES.notCovered, REPLIES.answerable]);
        await chatPage.selectors.chatInput.fill('first');
        await chatPage.selectors.chatInput.press('Enter');
        await expect(chatPage.selectors.chatMessageAssistant).toHaveCount(1);
        await chatPage.selectors.chatInput.fill('second');
        await chatPage.selectors.chatInput.press('Enter');
        await expect(chatPage.selectors.chatMessageAssistant).toHaveCount(2);
        expect(await chatPage.userMessages()).toEqual(['first', 'second']);
        expect(await chatPage.fetchDataLabels()).toEqual(['NOT_COVERED', 'ANSWERABLE']);
        expect(calls).toEqual([{ message: 'first' }, { message: 'second' }]);
    });
});