const { test, expect } = require('../../fixtures/checkout');
const CartPage = require('../../page-objects/storefront/CartPage');
const SupportWidgetPage = require('../../page-objects/storefront/SupportWidgetPage');
const { query } = require('../../utils/db-client');

const ASSISTANT_URL = process.env.ASSISTANT_URL || 'http://localhost:3100';
const channelSlug = 'channel-pkr';
const productTitle = 'Tulip & Teak Underwear';

// The injected widget script is inline content, so a storefront CSP could block it.
test.use({ bypassCSP: true });

test.describe('S1.5 Support assistant widget inside the storefront (stub provider)', () => {
    test.beforeEach(async ({ request }) => {
        let healthText = '';
        try {
            const res = await request.get(`${ASSISTANT_URL}/health`);
            healthText = res.ok() ? await res.text() : '';
        } catch {
            // assistant not running
        }
        test.skip(!/stub/i.test(healthText), 'Start the assistant first: $env:LLM_PROVIDER=\'stub\'; npm run assistant');
    });

    test('SUP-01: Widget mounts on a storefront page and answers a delivery question', async ({ page }) => {
        await page.goto(`/en/${channelSlug}/products`);
        await expect(page.getByTestId('ProductList')).toBeVisible();
        const widget = new SupportWidgetPage(page);
        await widget.mount();
        const reply = await widget.ask('How long does delivery take?');
        expect(reply.label).toBe('ANSWERABLE');
        expect(reply.answer).toContain('3 to 5 working days');
    });

    test('SUP-02: Order placed through the storefront checkout is found by the assistant', async ({ page, guestEmail }) => {
        const cartPage = new CartPage(page);
        let orderNumber, dbStatus;

        await test.step('Place a guest order through the storefront checkout', async () => {
            await page.goto(`/en/${channelSlug}/products`);
            expect(await cartPage.searchProductInList(productTitle)).toBe(true);
            await cartPage.assertCartProductVisibility(productTitle);
            await cartPage.validAddressDetailCheck({
                firstName: 'Mukhtar', lastName: 'Jee', email: guestEmail,
                streetAddress1: '245th Badshah St.', city: 'Lahore',
                postalCode: '54000', countryArea: 'Punjab', country: 'Pakistan',
            });
            ({ orderNumber } = await cartPage.orderSubmission());
            expect(orderNumber).toMatch(/^\d+$/);
            const row = (await query('SELECT status FROM order_order WHERE number = $1', [orderNumber]))[0];
            expect(row, `order #${orderNumber} in DB`).toBeDefined();
            dbStatus = String(row.status).toUpperCase();
        });

        const widget = new SupportWidgetPage(page);
        await test.step('Open the widget on a storefront page', async () => {
            await page.goto(`/en/${channelSlug}/products`);
            await expect(page.getByTestId('ProductList')).toBeVisible();
            await widget.mount();
        });

        await test.step('Order number without an email gets the fixed AMBIGUOUS reply', async () => {
            const reply = await widget.ask(`Where is my order #${orderNumber}?`);
            expect(reply.label).toBe('AMBIGUOUS');
        });

        await test.step('Order number with a wrong email gets the fixed NOT_COVERED refusal', async () => {
            const reply = await widget.ask(`Where is my order #${orderNumber}? My email is nobody-${Date.now()}@tester.com`);
            expect(reply.label).toBe('NOT_COVERED');
        });

        await test.step('Order number with the right email returns the real order status', async () => {
            const reply = await widget.ask(`Where is my order #${orderNumber}? My email is ${guestEmail}`);
            expect(reply.label).toBe('ANSWERABLE');
            expect(reply.answer).toContain(`STUB: your order status is ${dbStatus}.`);
        });
    });
});