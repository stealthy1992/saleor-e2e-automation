const { expect } = require('@playwright/test');
const path = require('path');

const ASSISTANT_URL = process.env.ASSISTANT_URL || 'http://localhost:3100';
const WIDGET_PATH = path.join(__dirname, '..', '..', 'assistant', 'public', 'chat-widget.js');

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
        await this.page.evaluate(() => {
            const root = document.createElement('div');
            root.id = 'chat-widget';
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