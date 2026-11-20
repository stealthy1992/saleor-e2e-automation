const { expect } = require('@playwright/test');
class BasePage {
    constructor(page) {
        this.page = page;
        this.selectors = {
        }

    }

    async assertCartProductVisibility(productName) {
        await this.page.getByRole('button', { name: 'Add to bag' }).waitFor({ state: 'visible' });
        await expect(this.page.getByRole('button', { name: 'Add to bag' })).toBeEnabled();
        await this.page.getByRole('button', { name: 'Add to bag' }).click();
        await expect(this.page.getByRole('button', { name: 'Adding' })).toBeVisible();
        await expect(this.page.getByRole('button', { name: 'Add to bag' })).toBeEnabled({ timeout: 10000 });
        // await this.selectors.cartNavItem.waitFor({ state: 'visible' });
        const badge = this.page.getByTestId('CartNavItem').locator('span').first();
        await expect(badge).toBeVisible();
        await expect(badge).toHaveText('1');
        await this.page.getByTestId('CartNavItem').click();
        await this.page.getByRole('link', { name: 'Checkout' }).waitFor({ state: 'visible' });
        await expect(this.page.locator('div[role="dialog"] a', { hasText: productName })).toBeVisible();
        await this.page.getByRole('link', { name: 'Checkout' }).click();
        await expect(this.page).toHaveURL(/\/checkout\?checkout=[\w-=]+&step=contact&locale=en$/);
    }
}

module.exports = BasePage;