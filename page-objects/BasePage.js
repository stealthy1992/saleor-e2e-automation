const { expect } = require('@playwright/test');

class BasePage {
    constructor(page) {
        this.page = page;
        this.announcementCloseButton = page.getByTestId('ripple-video-announcement-dismiss');
        this.productsTab = page.getByTestId('products-tab');
        this.assignProductsButton = page.getByTestId('assign-product');
        this.addProductsButton = page.getByTestId('add-product');
        this.email = page.getByTestId('email');
        this.password = page.getByTestId('password');
        this.loginButton = page.getByTestId('submit');
        this.welcomeMessage = page.locator('span', { hasText: "Saleor Dashboard" });
        this.logoutMenu = page.getByTestId('userMenu');
        this.logoutButton = page.getByTestId('log-out-button');
        this.signInForm = page.locator('form', { has: page.locator('span', { hasText: "Sign In" }) });
        this.backToDashboardButton = page.locator('button', { hasText: "Go back to dashboard" });
        this.pageNotFound = page.locator('span', { hasText: "Sorry, the page was not found" });
    }

    async pageRestrictedWith404() {
        await this.backToDashboardButton.waitFor({ state: 'visible' });
        expect(await this.pageNotFound).toBeVisible();
        expect(await this.backToDashboardButton).toBeVisible();
    }

    async logout() {
        await this.logoutMenu.waitFor({ state: 'visible' });
        await this.logoutMenu.click();
        await this.logoutButton.waitFor({ state: 'visible' });
        await this.logoutButton.click();
        await this.signInForm.waitFor({ state: 'visible' })
    }

    

    async dismissAnnouncement() {
        try {
            await this.announcementCloseButton.waitFor({ state: 'visible', timeout: 5000 });
            await this.announcementCloseButton.click({ timeout: 3000 });
            await this.announcementCloseButton.waitFor({ state: 'hidden', timeout: 3000 });
        } catch (err) {
            console.log('dismissAnnouncement: did not fully complete —', err.message);
        }
    }

    async navigateToAssignedProducts() {
        // const candidates = [this.assignProductsButton, this.addProductsButton];
        // await this.selectors.productsTab.waitFor({ state: 'visible' });
        // await this.selectors.productsTab.click();
        // await this.addProductsButton.waitFor({ state: 'visible' });
        if (await this.assignProductsButton.isVisible()) {
            await this.assignProductsButton.click();
        }
        else if (await this.addProductsButton.isVisible()) {
            await this.addProductsButton.click();
        }

        await this.page.locator('span', { hasText: 'Assign product' }).waitFor({ state: 'visible' });
    }

    async assignProduct(product) {
        await this.page.locator('input[placeholder="Search products"]').waitFor({ state: 'visible' });
        await this.page.locator('input[placeholder="Search products"]').fill(product.name);
        await this.page.waitForTimeout(2000);
        const productsResults = await this.page.locator('[data-test-id="assign-product-table-row"]');
        const productCount = await productsResults.count();
        for (let i = 0; i < productCount; i++) {
            const productTitle = await productsResults.nth(i).locator('td').last().innerText();
            console.log(productTitle);
            if (productTitle.trim() === product.name) {
                await productsResults.nth(i).locator('input').click();
                await expect(this.page.locator('[data-test-id="submit"]')).toBeEnabled();
                await this.page.locator('[data-test-id="submit"]').click();
                break;
            }
        }
    }
}

module.exports = BasePage;