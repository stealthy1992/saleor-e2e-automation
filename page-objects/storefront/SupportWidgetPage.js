const { expect } = require('@playwright/test');
const path = require('path');

const ASSISTANT_URL = process.env.ASSISTANT_URL || 'http://localhost:3100';
const WIDGET_PATH = path.join(__dirname, '..', '..', 'assistant', 'public', 'chat-widget.js');

// Same look as assistant/public/index.html, but every rule is scoped under #chat-widget so nothing leaks into the
// storefront, and the widget floats bottom-right instead of sitting after the footer.
const WIDGET_CSS = `
#chat-widget { position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; width: 360px; height: 460px; display: flex; flex-direction: column; background: #fff; color: #222; border: 1px solid #d8d2c8; border-radius: 10px; box-shadow: 0 4px 16px rgba(0,0,0,.18); font-family: system-ui, sans-serif; font-size: 14px; }
#chat-widget .chat-header { padding: 12px 16px; font-weight: 600; border-bottom: 1px solid #e6e1d8; }
#chat-widget .chat-messages { flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
#chat-widget .msg { max-width: 85%; padding: 8px 12px; border-radius: 10px; line-height: 1.4; white-space: pre-wrap; }
#chat-widget .msg.user { align-self: flex-end; background: #3b6e5a; color: #fff; }
#chat-widget .msg.bot { align-self: flex-start; background: #efeae1; }
#chat-widget .msg.pending, #chat-widget .msg.error { align-self: flex-start; color: #666; font-style: italic; }
#chat-widget .msg.error { color: #a12; }
#chat-widget .clauses { margin-top: 4px; font-size: 12px; color: #666; }
#chat-widget .chat-form { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid #e6e1d8; }
#chat-widget .chat-form input { flex: 1; padding: 8px 10px; border: 1px solid #c9c2b6; border-radius: 6px; font: inherit; }
#chat-widget .chat-form button { padding: 8px 16px; border: 0; border-radius: 6px; background: #3b6e5a; color: #fff; font: inherit; cursor: pointer; }
#chat-widget .chat-form button:disabled { opacity: 0.5; cursor: default; }
`;

// Widget attributes are data-test-id (the storefront uses data-testid), so plain attribute locators are used here.
class SupportWidgetPage {
    constructor(page) {
        this.page = page;
        this.input = page.locator('[data-test-id="chat-input"]');
        this.sendButton = page.locator('[data-test-id="chat-send"]');
        this.bubbles = page.locator('[data-test-id="chat-message-assistant"]');
    }

    // The widget posts to a relative /api/chat, which on the storefront origin would hit the storefront.
    // route.fetch runs outside the browser (no CORS) and returns the assistant's reply to the page.
    async mount() {
        await this.page.route('**/api/chat', async (route) => {
            const response = await route.fetch({ url: `${ASSISTANT_URL}/api/chat` });
            await route.fulfill({ response });
        });
        await this.page.addStyleTag({ content: WIDGET_CSS });
        await this.page.evaluate(() => {
            const root = document.createElement('div');
            root.id = 'chat-widget';
            root.setAttribute('data-test-id', 'chat-widget');
            document.body.appendChild(root);
        });
        await this.page.addScriptTag({ path: WIDGET_PATH });
        await expect(this.input).toBeVisible();
    }

    async ask(text) {
        const before = await this.bubbles.count();
        await this.input.fill(text);
        await this.sendButton.click();
        await expect(this.bubbles).toHaveCount(before + 1);
        const bubble = this.bubbles.nth(before);
        return {
            label: await bubble.getAttribute('data-label'),
            answer: (await bubble.locator('[data-test-id="chat-answer"]').innerText()).trim(),
        };
    }
}

module.exports = SupportWidgetPage;