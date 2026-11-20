const { expect } = require('@playwright/test');
const BasePage = require('./BasePage');

const currencyPrefix = (currency) =>
    new Intl.NumberFormat('en', { style: 'currency', currency })
        .formatToParts(0)
        .find(p => p.type === 'currency').value;

const noDigits = (str) => str.replace(/[\d.,\s]/g, '');
const lettersOnly = (str) => str.replace(/[^A-Za-z]/g, '');

class ProductsPage extends BasePage {

    constructor(page) {
        super(page);
        this.page = page;
        this.selectors = {
            productList: page.getByTestId('ProductList').first(),
            productTiles: page.locator('article[class="group"]'),
            allProductsLink: page.locator('a', { hasText: 'All', exact: true }),
            allProductsPageTitle: page.locator('h1', { hasText: 'All Products', exact: true }),
            topNav: page.getByRole('navigation', { name: 'Main' }).nth(1),

        }
    }

    async fetchCollectionProducts(collectionName) {
        const section = this.page.locator('section')
            .filter({ has: this.page.locator('h2', { hasText: collectionName }) }).first();
        const shown = await section.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
        if (!shown) return null;
        const titles = await section.locator('article h3').allInnerTexts();
        return titles.map(t => t.trim());
    }

    async assertChannelCurrency(currency) {
        const expected = currencyPrefix(currency);
        await this.page.getByRole('link', { name: 'Next' }).waitFor({ state: 'visible' });
        const nextPageButton = await this.page.getByRole('link', { name: 'Next' });
        while (true) {
            const getCursor = () => new URL(this.page.url()).searchParams.get('cursor');

            const cursorBefore = getCursor();   // null on the first page

            await this.selectors.productList.first().waitFor({ state: 'visible' });
            const products = this.selectors.productList.locator('article');
            const productCount = await products.count();
            console.log('Product count is: ', productCount);
            for (let i = 0; i < productCount; i++) {
                // const productName = await products.nth(i).locator('h3').innerText();
                const price = await products.nth(i).locator('span.font-semibold.tabular-nums').innerText();
                const rest = price.replaceAll(expected, '');
                expect(rest, `price "${price}" on card ${i}`).toMatch(/^[\d.,\s\u00A0\-–]+$/);
                expect(price.trim().startsWith(expected), `price "${price}" on card ${i}`).toBe(true);
            }

            if (!(await nextPageButton.isVisible()) || (await nextPageButton.isDisabled())) break;
            else await nextPageButton.click();
            await expect(this.page).toHaveURL(url => url.searchParams.get('cursor') !== cursorBefore);
        }
    }

    async countProductsInChannel() {
        let total = 0;
        await this.page.getByRole('link', { name: 'Next' }).waitFor({ state: 'visible' });
        const nextPageButton = await this.page.getByRole('link', { name: 'Next' });
        while (true) {
            const getCursor = () => new URL(this.page.url()).searchParams.get('cursor');

            const cursorBefore = getCursor();   // null on the first page

            await this.selectors.productList.first().waitFor({ state: 'visible' });
            const products = await this.selectors.productList.locator('article');
            total += await products.count();

            if (!(await nextPageButton.isVisible()) || (await nextPageButton.isDisabled())) break;
            else await nextPageButton.click();
            await expect(this.page).toHaveURL(url => url.searchParams.get('cursor') !== cursorBefore);
        }
        return total;
        // await this.page.locator('h1', { hasText: productTitle, exact: true }).waitFor({ state: 'visible' });
    }

    async assertProductList() {
        await expect(this.selectors.productList).toBeVisible();
        // await this.selectors.productTiles.first.waitFor({ state: 'visible' });
        const productCount = await this.selectors.productTiles.count();
        expect(productCount).toEqual(8);
        for (let i = 0; i < productCount; i++) {
            await expect(this.selectors.productTiles.nth(i).locator('h3')).toContainText('Tulip & Teak');
            // const productTitle = await this.selectors.productTiles.nth(i).locator('h3').innerText();
            // console.log(`Product title is ${productTitle}`);

        }
    }

    async navigateToProductListing() {
        await this.selectors.allProductsLink.first().waitFor({ state: 'visible' });
        await this.selectors.allProductsLink.first().click();
        await expect(this.selectors.allProductsPageTitle).toBeVisible();
    }

    async navigateToProduct(productName) {
        const slug = productName.toLowerCase().replace(/\s+/g, '-');
        await expect(this.selectors.allProductsPageTitle).toBeVisible();
        const productCount = await this.selectors.productTiles.count();
        for (let i = 0; i < productCount; i++) {
            const uiTitle = await this.selectors.productTiles.nth(i).locator('h3').innerText();
            if (uiTitle.toLowerCase() === productName.toLowerCase()) {
                await this.selectors.productTiles.nth(i).click();
                break;
            }
        }
        await expect(this.page).toHaveURL(new RegExp(`/products/${slug}`));
        await this.page.locator('h1', { hasText: productName.trim(), exact: true }).waitFor({ state: 'visible' });
        // await expect(this.page.locator('h1')).toHaveText(productName.trim());
    }

    async assertPageExists() {
        try {
            await this.selectors.productList.waitFor({ state: 'visible', timeout: 5000 });
        }
        catch {

        }
        if (!(await this.selectors.productList.first().isVisible())) {
            await expect(this.page.locator('p', { hasText: 'No products match your filters.' })).toBeVisible();
        }
    }

    async verifyAttributeVisibility(urlSlug) {
        const keywords = urlSlug.split('-').filter(Boolean);
        await this.page.getByRole('button', { name: 'Add to bag' }).waitFor({ state: 'visible' });
        // await expect(this.page.locator('h1')).not.toBeEmpty();
        for (const keyword of keywords) {
            await expect(this.page.locator('h1'), `h1 should contain "${keyword}"`).toContainText(keyword, { ignoreCase: true });
        }
        await expect(this.page.locator('span', { hasText: 'PKR' })).toBeVisible();
    }

    async verifyCartButtonBehavior() {
        await this.page.locator('h1', { hasText: 'Blue Polygon Shirt' }).waitFor({ state: 'visible' });
        await expect(
            this.page.getByRole('button', { name: 'Select options', exact: true })
        ).toBeDisabled();
        const variants = await this.page.locator('[aria-labelledby="variant-label-size"] button');
        const variantCount = await variants.count();
        for (let i = 0; i < variantCount; i++) {
            if (!await variants.nth(i).isDisabled()) {
                await variants.nth(i).click();
                break;
            }
        }
        await expect(this.page.getByRole('button', { name: 'Add to bag' })).toBeEnabled();
    }

    async verifyBagButtonDisable(outOfStockVariant) {
        await expect(
            this.page.getByRole('button', { name: `Size ${outOfStockVariant}, out of stock` })
        ).toBeDisabled();
    }
}

module.exports = ProductsPage;