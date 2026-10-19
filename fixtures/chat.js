const base = require('@playwright/test');
const ChatWidgetPage = require('../page-objects/ChatWidgetPage');

const REPLIES = {
  answerable: { answer: 'Delivery takes 3 to 5 working days.', clauses: ['3.1'], label: 'ANSWERABLE' },
  notCovered: { answer: 'The policy does not cover this.', clauses: [], label: 'NOT_COVERED' },
  conflict: { answer: 'The policy contradicts itself on this.', clauses: ['3.1', '4.1'], label: 'CONFLICT' },
  ambiguous: { answer: 'Please send the email used for the order.', clauses: [], label: 'AMBIGUOUS' },
};

// Intercepts POST /api/chat. `reply` is one object, or an array consumed in order (last one repeats).
// Options: status, body (raw string, overrides reply), delayMs, abort (network failure).
// Returns the array of request bodies the widget sent. The newest route wins over older ones.
async function mockChat(page, reply, { status = 200, body, delayMs = 0, abort = false } = {}) {
  const calls = [];
  const queue = Array.isArray(reply) ? [...reply] : null;
  await page.route('**/api/chat', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') return route.fallback();
    calls.push(request.postDataJSON());
    if (abort) return route.abort('failed');
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const next = queue ? (queue.length > 1 ? queue.shift() : queue[0]) : reply;
    const payload = body !== undefined ? body : JSON.stringify(next);
    try {
      await route.fulfill({ status, contentType: 'application/json', body: payload });
    } catch {
      // page closed while the response was delayed
    }
  });
  return calls;
}

const test = base.test.extend({
  chatPage: async ({ page }, use) => {
    const chatPage = new ChatWidgetPage(page);
    await chatPage.open();
    await use(chatPage);
  },
});

module.exports = { test, expect: base.expect, mockChat, REPLIES };