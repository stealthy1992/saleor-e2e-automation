const { test, expect } = require('@playwright/test');
const ProductsPage = require('../../page-objects/storefront/ProductsPage')
const { query } = require('../../utils/db-client');

test.describe('M2 Product listing and navigation', () => {

    let productPage;
    const productName = 'Banana Juice';
    const CHANNELS = ['default-channel', 'channel-pln', 'channel-pkr'];
    const CATEGORIES = ['accessories', 'apparel', 'groceries'];

    test.beforeEach(({ page }) => {
        productPage = new ProductsPage(page);
    })
    test('PLP-01: Open /en/channel-pkr/products', async ({ page }) => {
        await page.goto('/en/channel-pkr/products');
        await productPage.assertProductList();
    })
    test('PLP-02: Click “All” in the nav, once', async ({ page }) => {
        await page.goto('/en/default-channel')
        await productPage.navigateToProductListing();
    })
    test('PLP-03: Open a product card', async ({ page }) => {
        await page.goto('/en/default-channel/products');
        await productPage.navigateToProduct(productName);
    })
    for (let channel of CHANNELS) {
        for (let category of CATEGORIES) {
            test(`PLP-04A: Categories pages [${channel}/${category}]`, async ({ page }) => {
                await page.goto(`/en/${channel}/categories/${category}`);
                await productPage.assertPageExists();
            })
        }

    }
    for (const channel of CHANNELS) {
        test(`PLP-04B: Collections against [${channel}]`, async ({ page }) => {
            const rows = await query(`
            SELECT col.name AS collection, p.name AS product
            FROM channel_channel c
            JOIN product_collectionchannellisting ccl ON ccl.channel_id = c.id
            JOIN product_collection col               ON col.id = ccl.collection_id
            JOIN product_collectionproduct cp         ON cp.collection_id = col.id
            JOIN product_product p                    ON p.id = cp.product_id
            JOIN product_productchannellisting pcl    ON pcl.product_id = p.id AND pcl.channel_id = c.id
            WHERE c.slug = $1 AND ccl.is_published = true AND pcl.is_published = true
            ORDER BY col.name, p.name;
        `, [channel]);
            const expected = new Map();
            for (const row of rows) {
                if (!expected.has(row.collection)) expected.set(row.collection, []);
                expected.get(row.collection).push(row.product);
            }
            await page.goto(`/en/${channel}`);
            let verified = 0;
            for (const [collection, products] of expected) {
                const uiProducts = await productPage.fetchCollectionProducts(collection);
                if (uiProducts === null) continue;
                verified++;
                for (const product of products) {
                    expect(uiProducts, `${collection}: ${product}`).toContain(product);
                }
            }
            test.info().annotations.push({ type: 'collections verified', description: `${verified}/${expected.size}` });
            if (expected.size > 0) expect(verified).toBeGreaterThan(0);
        });
    }

})

test.describe('M3 Product detail page', () => {
    let productPage;
    const productName = 'Tulip & Teak Joggers';
    const outOfStockVariant = 'XL'
    let urlSlug = 'tulip-teak-joggers';
    test.beforeEach(({ page }) => {
        productPage = new ProductsPage(page);
    })
    test('Product attributes and "Add to Bag" behavior', async ({ page }) => {
        await test.step('PDP-01: Open “Tulip & Teak Joggers”', async () => {
            await page.goto(`/en/channel-pkr/products/${urlSlug}`);
            await productPage.verifyAttributeVisibility(urlSlug);
        })
        await test.step('PDP-02: Add to bag', async () => {
            await productPage.assertCartProductVisibility(productName);
        })
    })
    test('Add to Bag button disabled until variant selected & for out-of-stock variant', async ({ page }) => {
        await test.step('PDP-03: Product with variants: add without picking one', async () => {
            await page.goto('/en/default-channel/products/blue-polygon-shirt');
            await productPage.verifyCartButtonBehavior();
        })
        await test.step('PDP-04: Out-of-stock variant, if one exists', async () => {
            await productPage.verifyBagButtonDisable(outOfStockVariant);
        })
    })
})