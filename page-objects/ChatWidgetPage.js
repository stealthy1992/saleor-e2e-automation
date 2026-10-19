const BasePage = require('./BasePage');
const { expect } = require('@playwright/test');

class ChatWidgetPage extends BasePage {

    constructor(page) {
        super(page);
        this.page = page;
        this.selectors = {
            chatWidget: page.getByTestId('chat-widget'),
            chatWidgetHeader: page.getByTestId('chat-header'),
            chatMessageList: page.getByTestId('chat-messages'),
            chatForm: page.getByTestId('chat-form'),
            chatInput: page.getByTestId('chat-input'),
            sendButton: page.getByTestId('chat-send'),
            chatMessageUser: page.getByTestId('chat-message-user'),
            chatMessageAssistant: page.getByTestId('chat-message-assistant'),
            chatPending: page.getByTestId('chat-pending'),
            chatError: page.getByTestId('chat-error'),
        };
    }

    async open() {
        await this.page.goto('/');
        await expect(this.selectors.chatWidget).toBeVisible();
    }

    // Types and sends; does not wait for any reply (use for error and pending cases).
    async send(text) {
        await this.selectors.chatInput.fill(text);
        await this.selectors.sendButton.click();
    }

    // Sends and waits until exactly one more assistant bubble has appeared.
    async ask(text) {
        const before = await this.selectors.chatMessageAssistant.count();
        await this.send(text);
        await expect(this.selectors.chatMessageAssistant).toHaveCount(before + 1);
    }

    answerOf(index) {
        return this.selectors.chatMessageAssistant.nth(index).getByTestId('chat-answer');
    }

    clausesOf(index) {
        return this.selectors.chatMessageAssistant.nth(index).getByTestId('chat-clauses');
    }

    async fetchDataLabels() {
        const bubbles = await this.selectors.chatMessageAssistant.all();
        return Promise.all(bubbles.map((bubble) => bubble.getAttribute('data-label')));
    }

    async userMessages() {
        return this.selectors.chatMessageUser.allInnerTexts();
    }
}

module.exports = ChatWidgetPage;