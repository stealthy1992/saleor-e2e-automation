const CartPage = require('../../page-objects/storefront/CartPage');
const { test, expect } = require('../../fixtures/checkout');
const { query } = require('../../utils/db-client');
const { graphqlRequest } = require('../../utils/graphql-client');

test.describe('M4 Cart & M5 Checkout (guest) combined', () => {
    let cartPage;
    const productTitle = 'Tulip & Teak Underwear';
    const channelSlug = 'channel-pkr';
    test.beforeEach(async ({ page }) => {
        cartPage = new CartPage(page);
    })
    test('All Cart operations combined', async ({ page }) => {
        await test.step('CRT-01: Cart page after adding one item', async () => {
            const productSlug = productTitle
                .toLowerCase()
                .replace(/[^a-z0-9\s-]/g, '')   // removes &, ', (, ), etc.
                .trim()
                .replace(/[\s-]+/g, '-');       // collapses spaces and repeated hyphens
            await page.goto(`/en/${channelSlug}/products/${productSlug}`);
            await cartPage.addProductToCart(productTitle);
            await page.goto(`/en/${channelSlug}/cart`);
            await cartPage.assertCartItemRetention(productTitle);
        })
        await test.step.skip('CRT-02: Change the quantity (inspect the DOM)', () => {
            // Not acheievable since there's no quantity update functionality on cart page
        })
        await test.step('CRT-03: Remove the item', async () => {
            await cartPage.removeCartProduct(productTitle);
        })
    })
    test('CRT-04: Fresh guest browser context, open the cart', async ({ page }) => {
        await page.goto(`/en/${channelSlug}/cart`);
        await expect(page.locator('p', { hasText: `Looks like you haven't added anything to your bag yet.` })).toBeVisible({ timeout: 5000 });
    })
    test('CRT: 05A: Cart add and checkout process', async ({ page, guestEmail, staffToken, saleorApi }) => {
        const channelName = 'Default Channel';
        let orderNumber, orderDetails;
        let availableShippingMethods = [];
        const customer = {
            firstName: 'Mukhtar',
            lastName: 'Jee',
            email: guestEmail,
            streetAddress1: '245th Badshah St.',
            city: 'Lahore',
            postalCode: '54000',
            countryArea: 'Punjab',
            country: 'Pakistan'
        }
        await test.step('CRT-05: Checkout link', async () => {
            await page.goto(`/en/${channelSlug}/products`);
            const isProductFound = await cartPage.searchProductInList(productTitle);
            expect(isProductFound).toBe(true);
            await cartPage.assertCartProductVisibility(productTitle);
        })
        await test.step('CHK-01: Address step, all fields empty, “Continue to shipping”', async () => {
            await cartPage.assertEmptyFieldsValidation();

        })
        await test.step('CHK-02: Valid email address', async () => {
            await cartPage.emailValidityCheck('blah');
        })
        await test.step('CHK-03: Valid address (PK, Lahore, 54000)', async () => {
            await cartPage.validAddressDetailCheck(customer);
        })
        await test.step('CHK-04: Shipping step', async () => {
            const rows = await query(`
                    SELECT DISTINCT
                        c.slug,
                        m.name
                    FROM shipping_shippingmethodchannellisting cl
                    JOIN shipping_shippingmethod m ON m.id = cl.shipping_method_id
                    JOIN channel_channel c         ON c.id = cl.channel_id
                    WHERE c.slug = $1
                    ORDER BY c.slug, m.name;
                `, [channelSlug]);
            for (let row of rows) {
                // console.log('Available shipping method is: ', row);
                availableShippingMethods.push(row.name);
            }
            const listedShippingMethods = await cartPage.fetchListedShippingMethods();
            expect(listedShippingMethods.length).toBeGreaterThan(0);
            for (let uiShippingMethod of listedShippingMethods) {
                expect(availableShippingMethods).toContain(uiShippingMethod);
            }
        })
        await test.step('CHK-05: Summary panel', async () => {
            const orderSummary = await cartPage.verifyOrderSummary();
            console.log(`Subtotal is ${orderSummary.subTotal} and shipping is ${orderSummary.shippingCost}`);
            expect(Number(orderSummary.subTotal) + Number(orderSummary.shippingCost)).toBeCloseTo(Number(orderSummary.total), 2);
            expect(orderSummary.lineItems[0]).not.toBe('');
            // expect(orderDetails.total).not.toBe('');
            // expect(orderDetails.shippingCost).not.toBe('');
            // expect(orderDetails).not.toBe([]);
        })
        // test('CHK-06: Postal code is optional', async () => {
        //     await page.goto(`/en/${channelSlug}/products`);
        //     expect(await cartPage.searchProductInList(productTitle)).toBe(true);
        //     await cartPage.assertCartProductVisibility(productTitle);
        //     await cartPage.validAddressDetailCheck({
        //         firstName: 'Mukhtar', lastName: 'Jee', email: guestEmail,
        //         streetAddress1: '245th Badshah St.', city: 'Lahore',
        //         postalCode: '', countryArea: 'Punjab', country: 'Pakistan'
        //     });
        // });
        await test.step('PAY-01/02: Payment step, then pay', async () => {
            orderDetails = await cartPage.orderSubmission();
            // console.log(`Order number is ${orderNumber}`);
        })
        await test.step('PAY-03	After PAY-01, check the Dashboard side by GraphQL (not the UI)', async () => {
            const { response, data } = await graphqlRequest(saleorApi, `
                query OrdersByEmail($email: String!) {
                    orders(first: 5, filter: { customer: $email }, sortBy: { field: NUMBER, direction: DESC }) {
                        edges { node { id number userEmail } }
                    }
                }
            `, { email: guestEmail }, staffToken);
            const edges = data.orders.edges;
            expect(edges).toHaveLength(1);
            expect(edges[0].node.userEmail).toBe(guestEmail);
            expect(String(edges[0].node.number)).toBe(orderDetails.orderNumber);

        })
        await test.step('PAY-04	After PAY-01, check the DB', async () => {
            const orderRes = (await query('SELECT * FROM order_order WHERE number = $1', [orderDetails.orderNumber]))[0];
            console.log(`Order in DB is ${orderRes}`);
            expect(orderRes).toBeDefined();
            expect(orderRes.user_email).toBe(guestEmail);
            const [{ count }] = await query('SELECT count(*) AS count FROM payment_transactionitem WHERE order_id = $1', [orderRes.id]);
            expect(Number(count)).toBeGreaterThanOrEqual(1);
            // await page.pause();
            const transactionRow = (await query(
                `
                SELECT o.number,
                    o.user_email,
                    o.charge_status,
                    t.name,
                    t.psp_reference,
                    t.currency,
                    t.charged_value,
                    t.authorized_value,
                    t.app_identifier
                FROM order_order o
                JOIN payment_transactionitem t ON t.order_id = o.id
                WHERE o.number = $1;
                `, [orderDetails.orderNumber]
            ))[0];
            console.log(`Payment details in DB are ${transactionRow.user_email} while value is ${transactionRow.charged_value}`);
            expect(transactionRow.user_email).toBe(guestEmail);
            // await page.pause();
            expect(Number(transactionRow.charged_value)).toEqual(Number(orderDetails.total))
        })
    })
})