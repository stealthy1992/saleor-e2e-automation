const { test, expect } = require('@playwright/test');

const CHANNELS = ['default-channel', 'channel-pln', 'channel-pkr'];

test.describe('M1 Channels', () => {
  for (const channel of CHANNELS) {
    test(`products page renders for ${channel}`, async ({ page }) => {
      await page.goto(`/en/${channel}/products`);
      const list = page.getByTestId('ProductList');
      await expect(list).toBeVisible();
      const cards = list.locator('a[href*="/products/"]');
      const count = await cards.count();
      expect(count).toBeGreaterThan(0);
      test.info().annotations.push({ type: 'cards', description: String(count) });
      const firstText = (await cards.first().innerText()).replace(/\s+/g, ' ').slice(0, 120);
      test.info().annotations.push({ type: 'first card', description: firstText });
    });
  }

  test('CH-02	Unknown channel route (for example /en/channel-xyz)', async ({ page }) => {
    await page.goto(`/en/channel-xyz/products`);
    await expect(page.locator('h1', { hasText: 'Page Not Found', exact: true })).toBeVisible();
  })

})

