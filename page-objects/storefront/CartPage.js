const { expect } = require('@playwright/test');
const BasePage = require('./BasePage');


const toNumber = (str) => Number(str.replace(/[^\d.]/g, ''));


class CartPage extends BasePage {
    constructor(page) {
        super(page);
        this.page = page;
        this.selectors = {
            addToBagButton: page.getByRole('button', { name: 'Add to bag' }),
            cartNavItem: page.getByTestId('CartNavItem'),
            cartProductList: page.getByTestId('CartProductList'),
            productList: page.getByTestId('ProductList'),
            nextPageButton: page.locator('a', { hasText: 'Next' }).first(),
            continueToShippingButton: page.getByRole('button', { name: 'Continue to shipping' }),
            emptyEmailError: page.locator('[id="email-error"]', { hasText: 'Email is required' }),
            invalidEmailError: page.locator('[id="email-error"]', { hasText: 'Please enter a valid email address' }),
            firstNameError: page.locator('div:has(> label[for="firstName"]) > p', { hasText: 'First name is required' }),
            lastNameError: page.locator('div:has(> label[for="lastName"]) > p', { hasText: 'Last name is required' }),
            streetAddressError: page.locator('div:has(> label[for="streetAddress1"]) > p', { hasText: 'Street address is required' }),
            cityError: page.locator('div:has(> label[for="city"]) > p', { hasText: 'City is required' }),
            shippingSectionHeader: page.locator('section > h2', { hasText: 'Shipping method' }),
            orderSummarySection: page.getByRole('article').locator('#order-summary-content'),
            postalCodeField: page.locator('[name="postalCode"]'),
            continueToPaymentButton: page.getByRole('button', { name: 'Continue to payment' }),
            payButton: page.getByRole('button', { name: /^Pay/ }),
            orderConfirmationMessage: page.locator('h1', { hasText: 'Thank you for your order!' }),
            paymentFailureError: page.locator('p', { hasText: 'App with provided identifier not found.' }),

        }
    }

    async orderSubmission() {
        let uiLineItems = [];
        await this.selectors.continueToPaymentButton.waitFor({ state: 'visible' });
        await this.selectors.continueToPaymentButton.click();

        await this.selectors.payButton.waitFor({ state: 'visible' });
        await expect(this.page.getByText(/Test mode/)).toBeVisible();
        await expect(this.selectors.payButton).toHaveText(/^Pay.*PKR/);
        await this.selectors.payButton.click();
        // await expect(this.selectors.paymentFailureError).not.toBeVisible();
        await expect(this.page.getByText('Payment failed')).toBeHidden();

        await this.selectors.orderConfirmationMessage.waitFor({ state: 'visible' });
        await expect(this.page).toHaveURL(/order/);
        const text = await this.page.getByText(/Order #/).textContent();
        expect(text).not.toBe('');
        const orderNumber = text.match(/Order #(\d+)/)?.[1];
        await this.selectors.orderSummarySection.waitFor({ state: 'visible' });
        await this.selectors.orderSummarySection.locator('li').first().waitFor({ state: 'visible' });
        const lineItems = await this.selectors.orderSummarySection.locator('li');
        const lineItemCount = await lineItems.count();
        console.log(`Lines item count is ${lineItemCount}`);
        for (let i = 0; i < lineItemCount; i++) {
            const itemName = await lineItems.nth(i).locator('p').first().innerText();
            console.log(`Item name is ${itemName}`);
            uiLineItems.push(itemName);
        }
        const subtotal = toNumber(await this.page.locator('div:has(> dt:text-is("Subtotal")) > dd').first().innerText());
        const shippingText = (await this.page.locator('div:has(> dt:text-is("Shipping")) > dd').first().innerText()).trim();
        console.log('Shipping text displayed is: ', shippingText);
        const shippingCost = shippingText === 'Free' ? 0 : toNumber(shippingText);

        const totalRow = await this.page.locator('div:has(> div > span:text-is("Total"))').first();
        const totalData = await totalRow.locator('> data');
        const total = Number(await totalData.getAttribute('value'));
        console.log(`Subtotal is ${subtotal} with shipping cost of ${shippingCost} and a total of ${total}`);
        return {
            orderNumber: orderNumber,
            subTotal: subtotal,
            shippingCost: shippingCost,
            total: total,
            lineItems: uiLineItems
        };
    }

    async verifyOrderSummary() {
        let uiLineItems = [];
        await this.selectors.orderSummarySection.waitFor({ state: 'visible' });
        await this.selectors.orderSummarySection.locator('li').first().waitFor({ state: 'visible' });
        const lineItems = await this.selectors.orderSummarySection.locator('li');
        const lineItemCount = await lineItems.count();
        console.log(`Lines item count is ${lineItemCount}`);
        for (let i = 0; i < lineItemCount; i++) {
            const itemName = await lineItems.nth(i).locator('p').first().innerText();
            console.log(`Item name is ${itemName}`);
            uiLineItems.push(itemName);
        }
        const subtotal = toNumber(await this.page.locator('div:has(> dt:text-is("Subtotal")) > dd').first().innerText());
        const shippingText = (await this.page.locator('div:has(> dt:text-is("Shipping")) > dd').first().innerText()).trim();
        console.log('Shipping text displayed is: ', shippingText);
        const shippingCost = shippingText === 'Free' ? 0 : toNumber(shippingText);

        const totalRow = await this.page.locator('div:has(> div > span:text-is("Total"))').first();
        const totalData = await totalRow.locator('> data');
        const total = Number(await totalData.getAttribute('value'));
        console.log(`Subtotal is ${subtotal} with shipping cost of ${shippingCost} and a total of ${total}`);
        return {
            subTotal: subtotal,
            shippingCost: shippingCost,
            total: total,
            lineItems: uiLineItems
        };
    }

    async fetchListedShippingMethods() {
        let uiShippingMethods = [];
        await this.page.locator('label').first().waitFor({ state: 'visible' });
        const shippingMethods = this.page.locator('section:has(> h2:text-is("Shipping method")) label');
        const shippingMethodCount = await shippingMethods.count();
        // console.log(`Shiooubg method count = `,shippingMethodCount);
        for (let i = 0; i < shippingMethodCount; i++) {
            const shippingMethodName = await shippingMethods.nth(i).locator('span').first().innerText();
            // console.log('Shipping method is ',shippingMethodName);
            uiShippingMethods.push(shippingMethodName.trim());
        }
        return uiShippingMethods;
    }

    async validAddressDetailCheck(customer) {
        await this.page.locator('input[type="email"]').waitFor({ state: 'visible' });
        await this.page.locator('input[type="email"]').fill(customer.email);
        await this.page.locator('input[name="firstName"]').fill(customer.firstName);
        await this.page.locator('input[name="lastName"]').fill(customer.lastName);
        await this.page.locator('input[name="streetAddress1"]').fill(customer.streetAddress1);
        await this.page.locator('input[name="city"]').fill(customer.city);
        const country = this.page.locator('select#country');
        await country.selectOption({ label: customer.country });
        await this.page.locator('[name="postalCode"]').fill(customer.postalCode);
        if (await this.page.locator('[name="cityArea"]').isVisible()) {
            await this.page.locator('[name="cityArea"]').fill(customer.countryArea);
        }
        else await this.page.locator('select#countryArea').selectOption({ label: customer.countryArea });

        await this.selectors.continueToShippingButton.waitFor({ state: 'visible' });
        await this.selectors.continueToShippingButton.click();
        await expect(this.selectors.shippingSectionHeader).toBeVisible();
    }

    async emailValidityCheck(email) {
        await this.page.locator('input[type="email"]').fill('');
        await this.page.locator('input[type="email"]').fill(email);
        await this.selectors.continueToShippingButton.click();
        await expect(this.selectors.invalidEmailError).toBeVisible({ timeout: 5000 });
    }

    async assertEmptyFieldsValidation() {
        await this.page.getByRole('textbox', { name: 'Email address' }).waitFor({ state: 'visible' })
        await this.page.getByRole('textbox', { name: 'Email address' }).fill('');
        await this.page.locator('input[name="firstName"]').fill('');
        await this.page.locator('input[name="lastName"]').fill('');
        await this.page.locator('input[name="streetAddress1"]').fill('');
        await this.page.locator('input[name="city"]').fill('');
        await this.selectors.continueToShippingButton.waitFor({ state: 'visible' });
        await this.selectors.continueToShippingButton.click();
        await expect(this.selectors.emptyEmailError).toBeVisible({ timeout: 5000 });
        await expect(this.selectors.firstNameError).toBeVisible();
        await expect(this.selectors.lastNameError).toBeVisible();
        // await expect(this.selectors.streetAddressError).toBeVisible();
        // await expect(this.selectors.cityError).toBeVisible();
        await expect(this.selectors.shippingSectionHeader).toBeHidden();
    }

    async addProductToCart(productTitle) {
        await this.page.locator('h1', { hasText: productTitle }).waitFor({ state: 'visible' });
        try {
            await this.selectors.addToBagButton.waitFor({ state: 'visible', timeout: 3000 });
        }
        catch {
            // Nothing happens
        }
        // await this.selectors.addToBagButton.waitFor({ state: 'visible' });
        if (await this.selectors.addToBagButton.isVisible()) {
            await this.selectors.addToBagButton.click();
        }
        // code for product with variant yet to be written

        await this.selectors.cartNavItem.click();
        // await this.page.locator('h3', { hasText: 'Your bag is empty' }).waitFor({ state: 'hidden' });
        await this.page.locator('a', { hasText: 'Checkout' }).waitFor({ state: 'visible' });
        // await expect(this.page.locator('a', { hasText: productTitle })).toBeVisible();
    }

    async assertCartItemRetention(productTitle) {

        await this.selectors.cartProductList.locator('li').first().waitFor({ state: 'visible' });
        const cartItems = this.selectors.cartProductList.locator('li');
        await expect(cartItems).toHaveCount(1);
        await expect(cartItems.first().locator('h2')).toHaveText(productTitle);
    }

    async removeCartProduct(productTitle) {
        await this.selectors.cartProductList.locator('li').first().waitFor({ state: 'visible' });
        const cartItems = await this.selectors.cartProductList.locator('li');
        const itemCount = await cartItems.count();
        for (let i = 0; i < itemCount; i++) {
            const itemTitle = await cartItems.nth(i).locator('h2').innerText();
            console.log(`Cart item name is ${itemTitle.trim()}`);
            if (itemTitle.trim() === productTitle.trim()) {
                await cartItems.nth(i).locator('button', { hasText: 'Remove' }).click();
                break;
            }
        }
        await expect(this.page.locator('p', { hasText: `Looks like you haven't added anything to your bag yet.` })).toBeVisible({ timeout: 5000 });
    }

    async searchProductInList(productTitle) {
        // let isNextEnabled = true;
        let isFound = false;
        while (true) {
            const getCursor = () => new URL(this.page.url()).searchParams.get('cursor');

            const cursorBefore = getCursor();   // null on the first page


            await this.selectors.productList.first().waitFor({ state: 'visible' });
            const products = await this.selectors.productList.locator('article');
            const productCount = await products.count();
            console.log(`Item count is ${productCount}`);
            for (let i = 0; i < productCount; i++) {
                const productName = await products.nth(i).locator('h3').innerText();
                if (productName.trim() === productTitle.trim()) {
                    await products.nth(i).click();
                    await this.page.locator('h1', { hasText: productTitle }).waitFor({ state: 'visible' });
                    isFound = true;
                    break;
                }
            }
            if (isFound) return true;
            if (!await this.selectors.nextPageButton.isEnabled()) break;
            else await this.selectors.nextPageButton.click();
            await expect(this.page).toHaveURL(url => url.searchParams.get('cursor') !== cursorBefore);
        }
        return isFound;
    }
}

module.exports = CartPage;