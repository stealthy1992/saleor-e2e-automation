const { test, expect } = require('@playwright/test');

test.describe('M8 Search', () => {
    const searchProduct = 'Team Shirt';
    test('SRCH-01: Search for “Team Shirt”', async ({ page }) => {
        await page.goto('/en/default-channel');
        await page.getByPlaceholder('Search for products...').waitFor({ state: 'visible' });
        await page.getByPlaceholder('Search for products...').fill(searchProduct);
        await page.getByPlaceholder('Search for products...').press('Enter');
        await page.waitForURL(/search/);
        await expect(page.locator('h1', { hasText: `Results for "${searchProduct}"`})).toBeVisible({ timeout: 5000 });
        await expect(page.getByTestId('ProductList')).toBeVisible();
        await expect(page.getByTestId('ProductList').locator('article')).toHaveCount(1);
    })
})