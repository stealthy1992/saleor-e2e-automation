const CartPage = require('../../page-objects/storefront/CartPage');
const { test, expect } = require('../../fixtures/checkout');
const { query } = require('../../utils/db-client')

test.describe('M4 Cart & M5 Checkout (guest) combined', () => {
    let cartPage;
    const productTitle = 'Tulip & Teak Beanies';
    const channelSlug = 'channel-pkr';
    test.beforeEach(async ({ page }) => {
        cartPage = new CartPage(page);
    })
    test('All Cart operations combined', async ({ page }) => {
        await test.step('CRT-01: Cart page after adding one item', async () => {
            const productSlug = productTitle.toLowerCase().replace(/\s+/g, '-');
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
    test('CRT: 05A: Cart add and checkout process', async ({ page, guestEmail }) => {
        const channelName = 'Default Channel';
        let availableShippingMethods = [];
        const customer = {
            firstName: 'Edward',
            lastName: 'Cullen',
            email: guestEmail,
            streetAddress1: '245th James St. Pine Ave.',
            city: 'Colorado'
        }
        await test.step('CRT-05: Checkout link', async () => {
            await page.goto(`/en/${channelSlug}/products`);
            await cartPage.searchProductInList(productTitle);
            await cartPage.assertCartProductVisibility(productTitle);
        })
        await test.step('CHK-01: Address step, all fields empty, “Continue to shipping”', async () => {
            await cartPage.assertEmptyFieldsValidation();

        })
        await test.step('CHK-03: Valid address (PK, Lahore, 54000)', async () => {
            await cartPage.emailValidityCheck('blah');
        })
        await test.step('CHK-03: Valid address (PK, Lahore, 54000)', async () => {
            await cartPage.validAddressDetailCheck(customer);
        })
        await test.step('CHK-04: Shipping step', async () => {
            const rows = await query(`
                    SELECT DISTINCT
                        cl.channel_id,
                        m.name
                    FROM shipping_shippingmethodchannellisting cl
                    JOIN shipping_shippingmethod m ON m.id = cl.shipping_method_id
                    WHERE cl.channel_id = $1
                    ORDER BY cl.channel_id, m.name;
                `, [79]);
            for(let row of rows){
                // console.log('Available shipping method is: ', row);
                availableShippingMethods.push(row.name);
            }
            const listedShippingMethods = await cartPage.fetchListedShippingMethods();
            for(let uiShippingMethod of listedShippingMethods){
                expect(availableShippingMethods).toContain(uiShippingMethod);
            }
        })
        await test.step('CHK-05: Summary panel', async () => {
            const orderDetails = await cartPage.verifyOrderSummary();
            expect(orderDetails.total).not.toBe('');
            expect(orderDetails.shippingCost).not.toBe('');
            expect(orderDetails).not.toBe([]);
        })
        await test.step('CHK-06: Postal code is optional (the label says “optional”)', async () => {
            await cartPage.orderSubmission();
        })
    })
})