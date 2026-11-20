const { test, expect } = require('@playwright/test');
const { ask } = require('../../utils/probe-channel-products');
const ProductsPage = require('../../page-objects/storefront/ProductsPage')

// const CHANNELS = ['default-channel', 'channel-pln', 'channel-pkr'];
const CHANNELS = [
  {
    channel: 'default-channel',
    currency: 'USD'
  },
  {
    channel: 'channel-pln',
    currency: 'PLN'
  },
  {
    channel: 'channel-pkr',
    currency: 'PKR'
  }
]
let productPage;

test.describe('M1 Channels', () => {

  for (let i = 0; i < CHANNELS.length; i++) {
    test(`products page renders for [${CHANNELS[i].channel}]`, async ({ page }) => {
      console.log(CHANNELS[i].channel);
      await page.goto(`/en/${CHANNELS[i].channel}/products`);
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

  test('CH-02 Unknown channel route (for example /en/channel-xyz)', async ({ page }) => {
    await page.goto(`/en/channel-xyz/products`);
    await expect(page.locator('h1', { hasText: 'Page Not Found', exact: true })).toBeVisible();
  })

})

test.describe('M7 Cross-channel isolation', () => {

  test('ISO-01	The same product slug is requested on channel-pln', async ({ page }) => {
    await page.goto(`en/${CHANNELS[1].channel}/products/tulip-teak-jeans`);
    await expect(page.locator('h1', { hasText: 'Product Not Found' })).toBeVisible({ timeout: 5000 });
  })
  for (let i = 0; i < CHANNELS.length; i++) {
    test(`ISO-02 Listing counts per channel [${CHANNELS[i].channel}]`, async ({ page }) => {
      productPage = new ProductsPage(page);
      await page.goto(`/en/${CHANNELS[i].channel}/products`);
      const channelData = await ask(CHANNELS[i].channel);
      // console.log('Table is: ', channelData);
      const uiTotal = await productPage.countProductsInChannel();
      // console.log(`UI product count is ${uiTotal} while DB product count is ${CHANNELS[i].channel}`);
      expect(uiTotal).toEqual(channelData.totalCount);
    })
  }
  for (let i = 0; i < CHANNELS.length; i++) {
    test(`ISO-03 Currency [${CHANNELS[i].channel}]`, async ({ page }) => {
      productPage = new ProductsPage(page);
      await page.goto(`/en/${CHANNELS[i].channel}/products`);
      await productPage.assertChannelCurrency(CHANNELS[i].currency);
    })
  }
})

