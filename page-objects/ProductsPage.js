const BasePage = require('../page-objects/BasePage');
const { expect } = require('@playwright/test');
class ProductsPage extends BasePage {
    constructor(page) {
        super(page);
        this.page = page;
        this.selectors = {
            addProduct: page.getByTestId('add-product'),
            productTypeSelectPopup: page.locator('span', { hasText: "Create product" }),
            productTypeSelect: page.getByTestId('dialog-product-type'),
            productTypeSelectOnProductPage: page.getByTestId('product-type'),
            productTypeSubmit: page.getByTestId('submit'),
            listBox: page.getByRole('listbox'),
            option: page.getByTestId('select-option'),
            productTitle: page.getByRole('textbox', { name: "name" }),
            rating: page.getByRole('textbox', { name: "rating" }),
            weight: page.getByRole('textbox', { name: "weight" }),
            descriptionBox: page.locator('.codex-editor [contenteditable="true"]'),
            channelPLNRow: page.getByTestId('Channel-PLN'),
            channelUSDRow: page.getByTestId('Channel-USD'),
            productSKU: page.getByTestId('sku'),
            trackInventory: page.getByRole('checkbox', { name: 'Track Inventory' }),
            productCategory: page.locator('[name="category"]'),
            productCollection: page.getByTestId('collections'),
            productSubmitButton: page.getByTestId('button-bar-confirm'),
            editSEOButton: page.getByTestId('edit-seo'),
            slugInput: page.getByRole('textbox', { name: 'slug' }),
            existingProducts: page.getByTestId('data-grid-canvas'),
            productDeleteButton: page.getByTestId('button-bar-delete'),
            deleteProductAlert: page.locator('span', { hasText: "Delete Product" }),
            deleteProductButton: page.getByRole('button', { name: "Delete" }),
            productTitleError: page.locator('div:has(span:has-text("This field is required")) ~ label'),
            duplicateSlugError: page.getByTestId('seo-form').getByText('Product with this Slug'),
            backButton: page.getByTestId('app-header-back-button'),
            leaveWithoutSavingAlert: page.locator('span', { hasText: "Leave without saving changes?" }),
            ignoreChangesButton: page.getByTestId('ignore-changes'),
            productTitlesInListing: page.locator('td[data-testid^="glide-cell-1-"]'),
            successMessage: page.locator('[data-test-type="success"]'),
            productAvailabilitySection: page.getByTestId('availability-card'),
            channelToggleButton: page
                .locator('div', { has: this.page.locator('span', { hasText: 'Published' }) }) // div that contains the span
                .locator('> label', { has: this.page.locator('> button') })                    // direct-child label that has a direct-child button
                .locator('> button'),
            showInListingsToggle: page
                .locator('div', { has: this.page.locator('span', { hasText: 'Show in listings' }) }) // div that contains the span
                .locator('> label', { has: this.page.locator('> button') })                    // direct-child label that has a direct-child button
                .locator('> button'),
            toggleAvailableForPurchase: page
                .locator('div', { has: this.page.locator('span', { hasText: 'Available for purchase' }) }) // div that contains the span
                .locator('> label', { has: this.page.locator('> button') })                    // direct-child label that has a direct-child button
                .locator('> button'),
            availabilityDate: page.locator('span', { hasText: 'Scheduled for' }),
            addVariantButton: page.getByTestId('button-add-variant'),
            variantNameInput: page.getByTestId('variant-name-input'),
            expandChannelSection: page.getByTestId('expand-icon'),
            manageChannelsButton: page.getByTestId('manage-channels-button'),
            manageChannelPopup: page.locator('span', { hasText: "Manage Products Channel Availability" }),
            channelPLNCheckbox: page.locator('input[name="Channel-PLN"]'),
            channelUSDCheckbox: page.locator('input[name="Channel-USD"]'),
            variantPrice: page.getByTestId('price-field'),
            variantCost: page.getByTestId('cost-price-field'),
            assignWarehouseButton: page.getByTestId('assign-warehouse-button'),
            assignWarehousePopup: page.locator('span', { hasText: "Assign Warehouses" }),
            variantRowEditButton: page.getByTestId('row-action-button'),
            configurations: page.getByRole('link', { name: 'Configuration', exact: true }),
            channelsConfiguration: page.getByTestId('configuration-menu-channels-settings-subsection-channels'),
            menuList: page.getByTestId('menu-list'),
            nextPage: page.getByTestId('button-pagination-next'),
            previousPage: page.getByTestId('button-pagination-back'),
            filterButton: page.getByTestId('filters-button'),
            addFilterButton: page.getByTestId('add-filter-button'),
            filterCategory: page.getByTestId('left-0'),
            filterValueDropdown: page.getByTestId('right-0'),
            saveFiltersButton: page.getByTestId('save-filters-button'),
            whereClause: page.locator('span', { hasText: 'Where' }),
            searchInput: page.getByTestId('search-input'),
            productRows: page.getByTestId('assign-product-table-row'),
            productNameInput: page.getByTestId('product-name-input'),
            channelSetup: page.getByTestId('setup-product-channels'),
            categorySetup: page.getByTestId('setup-product-category'),
            priceSetup: page.getByTestId('setup-product-offer'),
            availabilitySetup: page.getByTestId('setup-checklist-task-live'),
            seoSetup: page.getByTestId('setup-checklist-review-seo'),
            descriptionEditor: page.getByTestId('rich-text-editor-description'),
            showMoreButton: page.getByTestId('show-more-button'),
            deleteProductButton: page.getByTestId('delete-product'),
            dialogBox: page.locator('[role="dialog"]'),
            variantsList: page.getByTestId('variants-list'),
            // backButton: page.getByTestId('app-header-back-button'),
            productMediaSection: page.getByTestId('product-media')
        }
    }

    async isVariantListedInGrid(variantName) {
        await this.page.locator('span', { hasText: 'General Information', exact: true }).waitFor({ state: 'visible' });
        const variantsHeading = this.page.getByText('Variants', { exact: true });
        await variantsHeading.scrollIntoViewIfNeeded();

        const variantRows = this.page.locator('tbody tr');
        await variantRows.first().waitFor({ state: 'attached' }); // grid must mount before counting

        const rowCount = await variantRows.count();
        console.log(`Variant row count is ${rowCount}`);
        for (let i = 0; i < rowCount; i++) {
            const variantTitle = await variantRows.nth(i).locator('td').first().innerText();
            console.log(`Variant listed in the grid is ${variantTitle}`);
            if (variantTitle.trim() === variantName) {
                return true;
            }
        }
        return false;
    }

    async isVariantListedInPanel(variantName) {
        await this.selectors.addVariantButton.click();
        await this.selectors.variantsList.waitFor({ state: 'visible' });
        await this.page.getByTestId('variant-name').first().waitFor({ state: 'visible' });
        const listedVariants = await this.page.getByTestId('variant-name');
        const variantCount = await listedVariants.count();
        console.log('variant count is: ', variantCount);
        for (let i = 0; i < variantCount; i++) {
            const variantTitle = await listedVariants.nth(i).innerText();
            console.log(`Variant listed is ${variantTitle.trim()} and sent was ${variantName}`);
            if (variantTitle.trim() === variantName.trim()) {

                return true;
            }
            // else return false;
        }
        return false;
    }

    async searchProducts(keyword) {
        await this.selectors.searchInput.waitFor({ state: 'visible' });
        await this.selectors.searchInput.fill(keyword);
        await this.page.waitForTimeout(1000)
        const searchedProducts = await this.getAllListedProductNames();
        return searchedProducts;
    }

    async populateFilter(filterKeyInput, filterValueInput, filterType, filterValue) {
        await this.selectors.addFilterButton.click();
        await this.selectors.whereClause.waitFor({ state: 'visible' });
        await this.page.locator(`[data-test-id="${filterKeyInput}"]`).fill(filterType);
        await this.page.getByTestId('select-option', { hasText: filterType }).waitFor({ state: 'visible' });
        await this.page.getByTestId('select-option', { hasText: filterType }).click();
        await this.page.locator(`[data-test-id="${filterValueInput}"]`).click();
        await this.page.getByRole('option', { name: filterValue }).waitFor({ state: 'visible' });
        await this.page.getByRole('option', { name: filterValue }).click();
        // await expect(this.page.locator('span', { hasText: 'And', exact: true })).toBeVisible();
        try {
            await this.page.locator('span', { hasText: 'And', exact: true }).waitFor({ state: 'visible', timeout: 5000 });
            await this.page.locator('[data-test-id="right-2"]').fill('Channel-USD');
            await this.page.getByTestId('select-option', { hasText: 'Channel-USD' }).waitFor({ state: 'visible' });
            await this.page.getByTestId('select-option', { hasText: 'Channel-USD' }).click();
            // it appeared
        } catch {
            // it didn't, within the timeout
        }
        await expect(this.selectors.saveFiltersButton).toBeEnabled();
        await this.selectors.saveFiltersButton.click();
        await this.page.locator('table[role="grid"] tbody tr').first().waitFor({ state: 'attached' });
    }

    async addFilterOnProducts(filterType, filterValue) {
        await this.selectors.filterButton.click();
        await this.selectors.addFilterButton.waitFor({ state: 'visible' });
        const isWhereVisible = await this.selectors.whereClause.isVisible();
        console.log(`Where for filter ${filterType} is visible?: ${isWhereVisible}`);
        if (!isWhereVisible) {
            await this.populateFilter('left-0', 'right-0', filterType, filterValue)
        }
        else {
            await this.populateFilter('left-2', 'right-2', filterType, filterValue)
        }
    }

    async getMenuList() {
        let menuItemNames = [];
        const menuItems = await this.selectors.menuList.locator('> *');
        const menuItemCount = await menuItems.count();
        console.log(menuItemCount);
        for (let i = 0; i < menuItemCount; i++) {
            const menuItemName = await menuItems.nth(i).innerText();
            console.log('Menu Item name is: ', menuItemName);
            menuItemNames.push(menuItemName.trim());
        }
        return menuItemNames;

    }

    async verifyChannelRestriction() {
        await this.selectors.configurations.waitFor({ state: 'visible' });
        await this.selectors.configurations.click();
        await this.page.locator('[title="Configuration"]').waitFor({ state: 'visible' });
        await expect(this.selectors.channelsConfiguration).not.toBeVisible();
    }

    async navigateToTestVariant() {
        // await this.selectors.variantRowEditButton.last().waitFor({ state: 'visible' });
        // const variantRows = await this.selectors.variantRowEditButton;
        // const variantRowsCount = await variantRows.count();
        // console.log('Variant row for pricing count is: ', variantRowsCount);
        await this.page.getByTestId('row-action-button').last().waitFor({ state: 'visible' });
        const variantRowsCount = await this.page.getByTestId('row-action-button').count();
        console.log('Variant row for pricing count is: ', variantRowsCount);
        await this.page.getByTestId('row-action-button').nth(variantRowsCount - 2).click();
        // await this.page.pause();
        await this.page.locator('[data-test-id="variants-list"]').waitFor({ state: 'visible' });
        const availableChannels = await this.page.locator('[data-test-id^="Channel-"]');
        const channelCount = await availableChannels.count();
        for (let i = 0; i < channelCount; i++) {
            const channelName = await availableChannels.nth(i).innerText();
            if (channelName.trim() === 'Channel-USD') {
                const visibleCurrencyInstances = await channel.locator('label');
                const instanceCount = await visibleCurrencyInstances.count();
                for (let j = 0; j < instanceCount; j++) {
                    const currency = await visibleCurrencyInstances.nth(j).innerText();
                    console.log(`Currency is ${currency}`);
                    expect(currency.trim()).toBe('USD');
                }
            }
            else if (channelName.trim() === 'Channel-PLN') {
                const visibleCurrencyInstances = await channel.locator('label');
                for (let instance of visibleCurrencyInstances) {
                    const currency = await instance.innerText();
                    console.log(`Currency is ${currency}`);
                    expect(currency.trim()).toBe('PLN');
                }
            }
        }
        // const pricingTable = await this.page.locator('table', { has: this.page.locator('span', { hasText: "Channel Name" }) });
        // const pricingRows = await pricingTable.locator('tr');
        // const pricingRowsCount = await pricingRows.count();
        // for (let i = 0; i < pricingRowsCount; i++) {
        //     const rowChannel = await pricingRows.nth(i).getAttribute('data-test-id');
        //     console.log(rowChannel)
        //     if (rowChannel === 'Channel-PLN') {
        //         const currency = await pricingRows.nth(i).locator('td').nth(1).locator('label > span').innerText();
        //         expect(currency).toBe('PLN');
        //     }
        //     else if (rowChannel === 'Channel-USD') {
        //         const currency = await pricingRows.nth(i).locator('td').nth(1).locator('label > span').innerText();
        //         expect(currency).toBe('USD');
        //     }
        // }
    }
    async productVisibility(productName) {
        const matchingCell = this.page.locator('td[role="gridcell"]', { hasText: productName }).first();
        await matchingCell.waitFor({ state: 'attached' }); // NOT 'visible' — attribute reads don't need layout
    }

    getPlainTextFromDOM() {
        const root = document.querySelector('.codex-editor');
        if (!root) return '';

        const blocks = Array.from(root.querySelectorAll('.ce-block'));
        const texts = blocks.map(block => {
            // Try common content selectors used by Editor.js tools
            const content = block.querySelector(
                '.ce-block__content, .ce-paragraph, .ce-block__content p, [contenteditable]'
            );
            if (content) return content.innerText.trim();

            // If tool renders HTML inside the block, fall back to innerHTML -> text
            const html = block.innerHTML || '';
            // Strip tags and decode entities
            const tmp = document.createElement('div');
            tmp.innerHTML = html;
            return tmp.innerText.trim();
        }).filter(Boolean);

        return texts.join('\n\n');
    }


    async navigateBackToProductListing() {
        await this.selectors.backButton.waitFor({ state: 'visible' });
        await this.selectors.backButton.click();
        // inside your page object or test
        try {
            await this.selectors.leaveWithoutSavingAlert.waitFor({ state: 'visible', timeout: 3000 });
            await this.selectors.ignoreChangesButton.click();
        } catch {
            // timed out or not visible — do nothing
        }
        // wait until the URL no longer contains "keyword"
        await this.page.waitForURL(url => !url.toString().includes('product-type-id'), { timeout: 5000 });

    }

    async fetchCurrentSlug() {
        // await this.dismissAnnouncement();
        await this.selectors.editSEOButton.click();
        await this.selectors.slugInput.waitFor({ state: 'visible' });
        const slugValue = await this.selectors.slugInput.inputValue();
        return slugValue;
    }

    async giveNameAndSlug(productName, productSlug) {
        await this.dismissAnnouncement();
        await this.selectors.productTitle.fill(productName);
        await this.selectors.editSEOButton.click();
        await this.selectors.slugInput.waitFor({ state: 'visible' });
        await this.selectors.slugInput.fill(productSlug);
        await this.selectors.productSubmitButton.click();
        // await this.selectors.duplicateSlugError.waitFor({ state: 'visible' });
        // const isDisplayed = await this.selectors.duplicateSlugError.isVisible();
        // if (isDisplayed) {
        //     return true;
        // }
        // else return false;

        try {
            await this.selectors.duplicateSlugError.waitFor({ state: 'visible', timeout: 5000 });
            return true;
        } catch {
            return false;
        }

    }

    async productTypeSelection(product) {
        await this.selectors.addProduct.waitFor({ state: 'visible' });
        await this.selectors.addProduct.click();
        await this.selectors.productTypeSelectPopup.waitFor({ state: 'visible' });
        await this.selectors.productNameInput.fill(product.name);
        await this.selectors.productTypeSelect.fill(product.productType);
        const value = await this.selectors.productTypeSelect.inputValue();
        console.log('product type is: ', value);
        // await this.selectors.productTypeSelectPopup.click();
        await this.page.getByTestId('select-option', { hasText: product.productType }).waitFor({ state: 'visible' });
        await this.page.getByTestId('select-option', { hasText: product.productType }).click();
        // await this.page.waitForTimeout(1000);
        // await this.selectors.productTypeSelect.press('Enter');
        await expect(this.selectors.productTypeSubmit).toBeEnabled({ timeout: 5000 });
        await this.selectors.productTypeSubmit.click();
        await this.selectors.addProduct.waitFor({ state: 'hidden' });
        // waits until URL matches regex
        await expect(this.page).toHaveURL(/action=setup/);
    }



    async createProduct(product) {
        let availableChannels = [];
        await this.selectors.channelSetup.waitFor({ state: 'visible' });
        await this.selectors.channelSetup.click();
        await this.selectors.manageChannelPopup.waitFor({ state: 'visible' });

        for (let channel of product.channels) {
            availableChannels.push(channel.name);
        }
        if (availableChannels.includes('Channel-USD')) {
            await this.page.locator('input[name="Channel-USD"]').click();
            // await this.selectors.channelUSDRow.locator('input').nth(1).fill(product.channels[0].costPrice);

        }
        if (availableChannels.includes('Channel-PLN')) {
            await this.page.locator('input[name="Channel-PLN"]').click();
            // await this.selectors.channelPLNRow.locator('input').nth(0).fill(product.channels[1].sellingPrice);
            // await this.selectors.channelPLNRow.locator('input').nth(1).fill(product.channels[1].costPrice);

        }

        await expect(this.selectors.productTypeSubmit).toBeEnabled();
        await this.selectors.productTypeSubmit.click();
        await this.selectors.manageChannelPopup.waitFor({ state: 'hidden' });
        await expect(this.selectors.productSubmitButton).toBeEnabled();
        await this.selectors.productSubmitButton.click();
        await this.selectors.successMessage.waitFor({ state: 'visible' });
        await this.selectors.successMessage.waitFor({ state: 'hidden' });
        await this.selectors.descriptionBox.type(product.description, { delay: 20 });
        await expect(this.selectors.productSubmitButton).toBeEnabled();
        await this.selectors.productSubmitButton.click();
        await this.selectors.successMessage.waitFor({ state: 'visible' });
        await this.selectors.successMessage.waitFor({ state: 'hidden' });
        // const description = await this.page.locator('.codex-editor').innerText();

        // if (product?.trackInventory === true) {
        //     await this.selectors.trackInventory.click();
        // }
        // const productTypeValue = await this.selectors.productTypeSelectOnProductPage.inputValue();
        // if (productTypeValue === '') {
        //     await this.selectors.productTypeSelectOnProductPage.fill(product.productType);
        //     const value = await this.selectors.productTypeSelectOnProductPage.inputValue();
        //     console.log('product type is: ', value);
        //     // await this.selectors.productTypeSelectPopup.click();
        //     await this.page.getByTestId('select-option', { hasText: product.productType }).waitFor({ state: 'visible' });
        //     await this.page.getByTestId('select-option', { hasText: product.productType }).click();
        // }
        // try {
        //     await this.selectors.leaveWithoutSavingAlert.waitFor({ state: 'visible', timeout: 3000 });
        //     await this.selectors.ignoreChangesButton.click();
        // } catch {
        //     // timed out or not visible — do nothing
        // }
        // await this.selectors.productCategory.fill(product.category);
        // const categoryValue = await this.selectors.productCategory.inputValue();
        // console.log('Category is: ', categoryValue);
        // await this.page.getByTestId('select-option')
        //     .getByText(product.category, { exact: true })
        //     .waitFor({ state: 'visible' });

        // await this.page.getByTestId('select-option')
        //     .getByText(product.category, { exact: true })
        //     .click();

        // // await this.page.getByTestId('select-option', { hasText: product.category }).waitFor({ state: 'visible' });
        // // await this.page.getByTestId('select-option', { hasText: product.category }).click();
        // await this.selectors.productCollection.fill(product.collections[0]);
        // await this.page.getByTestId('select-option', { hasText: product.collections[0] }).waitFor({ state: 'visible' });
        // await this.page.getByTestId('select-option', { hasText: product.collections[0] }).click();
        // await this.selectors.productSubmitButton.click();
        // // await this.selectors.successMessage.waitFor({ state: 'visible' }); // Added later in category stage
    }

    async ensureSubmitDisabled() {
        await this.selectors.productTitle.waitFor({ state: 'visible' });
        await this.selectors.productTitle.fill('');
        await expect(this.selectors.productSubmitButton).toBeDisabled();
        const isDisabled = await this.selectors.productSubmitButton.isDisabled();
        return isDisabled;

        // await this.selectors.productTitle.waitFor({ state: 'visible' });
        // await this.selectors.productSubmitButton.click();
        // // await this.selectors.productTitleError.waitFor({ state: 'visible'});
        // await this.page.locator('span', { hasText: "This field is required" }).first().waitFor({ state: 'visible' });
        // const titleError = await this.page.locator('span', { hasText: "This field is required" }).first();
        // const label = titleError.locator('xpath=../../label');
        // const labelName = await label.innerText();
        // return labelName;
    }

    async slugVerification() {
        await this.selectors.seoSetup.waitFor({ state: 'visible' })
        await this.selectors.seoSetup.click();
        await this.selectors.slugInput.waitFor({ state: 'visible' });
        // await this.page.waitForTimeout(100); // small delay

        // let slugValue = '';
        // while (slugValue === '') {
        //     slugValue = await this.selectors.slugInput.inputValue();
        //     await page.waitForTimeout(200);
        // }
        // await expect(this.selectors.slugInput).not.toHaveValue('', { timeout: 5000 });
        const slugValue = await this.selectors.slugInput.inputValue();
        return slugValue;
    }

    async purchaseStatus() {

    }



    async toggleShowInListings(channel) {
        await this.selectors.productAvailabilitySection.locator('span', { hasText: channel }).first().click();
        await this.page.locator('span', { hasText: "Show in listings" }).waitFor({ state: 'visible' });
        const listingStatusBeforeToggle = await this.selectors.showInListingsToggle.getAttribute('data-state');
        console.log('Listing status before toggle: ', listingStatusBeforeToggle);
        await this.selectors.showInListingsToggle.click();
        const channelStatusBeforeListingToggle = await this.selectors.channelToggleButton.getAttribute('data-state');
        console.log('Channel status is: ', channelStatusBeforeListingToggle);
        await this.selectors.productSubmitButton.click();
        await expect(this.selectors.productSubmitButton).toHaveText('Save', { timeout: 5000 });
        await this.selectors.productAvailabilitySection.locator('span', { hasText: channel }).first().click();
        await this.page.locator('span', { hasText: "Show in listings" }).waitFor({ state: 'visible' });
        const listingStatusAfterToggle = await this.selectors.showInListingsToggle.getAttribute('data-state');
        console.log('Listing status after toggle: ', listingStatusAfterToggle);
        const channelStatusAfterListingToggle = await this.selectors.channelToggleButton.getAttribute('data-state');
        console.log('Channel status is: ', channelStatusAfterListingToggle);
        expect(listingStatusAfterToggle).not.toBe(listingStatusBeforeToggle);
        expect(channelStatusAfterListingToggle).toBe(channelStatusBeforeListingToggle);
        if (listingStatusAfterToggle === 'on') {
            return true;
        }
        else return false;
        // return listingStatusAfterToggle;

    }

    async toggleStatusForChannel(channel, category) {
        await this.selectors.productAvailabilitySection.locator('span', { hasText: channel }).click();
        await this.page.locator('span', { hasText: "Published" }).waitFor({ state: 'visible' });
        // Chained locators, enforcing direct-child relationships

        const channelStatusBeforeToggle = await this.selectors.channelToggleButton.getAttribute('data-state');
        console.log('Channel status is: ', channelStatusBeforeToggle);
        await this.selectors.channelToggleButton.click();

        // Wait for the actual attribute change instead of reading it immediately —
        // headed mode renders real paint frames, so an immediate read can still
        // catch the pre-toggle value. This is a correctness fix, not just a
        // headed-mode workaround; it should hold up in headless CI too.
        const toggleHandle = await this.selectors.channelToggleButton.elementHandle();
        await this.page.waitForFunction(
            ({ el, previousState }) => el.getAttribute('data-state') !== previousState,
            { el: toggleHandle, previousState: channelStatusBeforeToggle },
            { timeout: 5000 }
        );

        await this.selectors.productCategory.fill(category);
        const categoryValue = await this.selectors.productCategory.inputValue();
        console.log('Category is: ', categoryValue);
        await this.page.getByTestId('select-option')
            .getByText(category, { exact: true })
            .waitFor({ state: 'visible' });

        await this.page.getByTestId('select-option')
            .getByText(category, { exact: true })
            .click();

        await expect(this.selectors.productSubmitButton).toBeEnabled();
        await this.selectors.productSubmitButton.click();
        await expect(this.selectors.productSubmitButton).toHaveText('Save', { timeout: 5000 });
        await this.selectors.productAvailabilitySection.locator('span', { hasText: channel }).first().click();
        await this.page.locator('span', { hasText: "Published" }).first().waitFor({ state: 'visible' });
        const channelStatusAfterToggle = await this.selectors.channelToggleButton.getAttribute('data-state');
        console.log('Channel status is: ', channelStatusAfterToggle);
        expect(channelStatusAfterToggle).not.toBe(channelStatusBeforeToggle);
    }

    async fetchVisibleDescription() {
        const description = await this.page.locator('.codex-editor').innerText();
        return description;
    }

    async updateProductDescription(updatedDesc) {
        await this.page.evaluate(() => {
            const el = document.querySelector('.codex-editor [contenteditable="true"]');
            if (!el) return;
            el.innerText = '';
            el.dispatchEvent(new InputEvent('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await this.page.waitForTimeout(500);
        await this.selectors.descriptionBox.type(updatedDesc, { delay: 20 });
        await this.selectors.productSubmitButton.click();
        await expect(this.selectors.productSubmitButton).toHaveText('Save', { timeout: 5000 });
        // const plainText = await this.page.evaluate(() => {
        //     return this.getPlainTextFromDOM();
        // });
        // console.log(plainText);
        const currentDescription = await this.fetchVisibleDescription();
        expect(currentDescription.trim()).toBe(updatedDesc);
        await this.selectors.successMessage.waitFor({ state: 'visible' });
        // await this.selectors.addProduct.waitFor({ state: 'visible'});
    }

    async updateProductTitle(name) {
        await this.selectors.productTitle.fill('');
        await this.selectors.productTitle.fill(name);
        await expect(this.selectors.productSubmitButton).toBeEnabled();
        await this.selectors.productSubmitButton.click();
        await expect(this.selectors.productSubmitButton).toHaveText('Save', { timeout: 5000 });
        const updatedValue = await this.selectors.productTitle.inputValue();
        expect(updatedValue).toBe(name);
    }

    // Inside e.g. VariantPage.js — assumes `this.page` already exists from constructor
    // async editWarehouseStock(rowText, warehouseColumnHeaderText, newValue) {
    //     const scroller = this.page.locator('.dvn-scroller').first();
    //     const canvas = this.page.locator('canvas').first();

    //     // Poll: scroll incrementally via real scrollLeft until target header appears in DOM
    //     let found = false;
    //     for (let i = 0; i < 20; i++) {
    //         const headerMatch = this.page.locator('th, td[role="columnheader"]', { hasText: warehouseColumnHeaderText });
    //         if (await headerMatch.count() > 0) { found = true; break; }
    //         await scroller.evaluate(el => el.scrollLeft += 150); // adjust step size as needed
    //         await this.page.waitForTimeout(100); // let virtualization re-render
    //     }
    //     if (!found) throw new Error(`Column "${warehouseColumnHeaderText}" never appeared after scrolling`);

    //     // Now compute position from whatever's CURRENTLY rendered, not the hidden element's own box
    //     const visibleHeaders = this.page.locator('th[role="columnheader"], td[role="columnheader"]');
    //     const headerTexts = await visibleHeaders.allInnerTexts();
    //     const targetIndex = headerTexts.findIndex(t => t.includes(warehouseColumnHeaderText));

    //     const canvasBox = await canvas.boundingBox();
    //     const perColumnWidth = canvasBox.width / headerTexts.length;
    //     const targetX = canvasBox.x + (targetIndex + 0.5) * perColumnWidth;

    //     const row = this.page.locator('tr[role="row"]', { hasText: rowText });
    //     const rowIndex = parseInt(await row.getAttribute('aria-rowindex'), 10);
    //     const totalRows = parseInt(await this.page.locator('table[role="grid"]').getAttribute('aria-rowcount'), 10);
    //     const rowHeight = canvasBox.height / totalRows;
    //     const targetY = canvasBox.y + (rowIndex - 1) * rowHeight + rowHeight / 2;

    //     await this.page.mouse.click(targetX, targetY);

    //     const activeInput = this.page.locator('input:focus, [contenteditable]:focus');
    //     if (await activeInput.count() > 0) {
    //         await activeInput.fill(String(newValue));
    //         await this.page.keyboard.press('Enter');
    //     } else {
    //         await this.page.keyboard.type(String(newValue));
    //         await this.page.keyboard.press('Enter');
    //     }
    // }

    async updateStockInWarehouses(updatedStockQuantity) {
        await this.page.locator('span', { hasText: "Warehouse Name" }).waitFor({ state: 'visible' });
        for (let warehouse of updatedStockQuantity) {
            await this.page.locator(`[data-test-id="${warehouse.name}"]`).locator('[data-test-id="stock-input"]').fill(String(warehouse.quantity));
        }
        // const warehouseTable = await this.page.locator('table', { has: this.page.locator('span', { hasText: "Warehouse Name" }) });
        // await warehouseTable.scrollIntoViewIfNeeded();
        // const lookup = new Map(updatedStockQuantity.map(i => [i.name, i.quantity]));
        // const rows = await warehouseTable.locator('tr');
        // const count = await rows.count();
        // for (let i = 0; i < count; i++) {
        //     const row = rows.nth(i);
        //     const id = await row.getAttribute('data-test-id');
        //     if (!id) continue;
        //     const qty = lookup.get(id);
        //     if (qty !== undefined) {
        //         const input = row.locator('input[data-test-id="stock-input"]');
        //         await input.fill(String(qty));
        //         // optionally trigger blur or Enter if the app reacts on change
        //         // await input.press('Enter');
        //     }
        // }
        await expect(this.selectors.productSubmitButton).toBeEnabled();
        await this.selectors.productSubmitButton.click();
        await expect(this.selectors.productSubmitButton).toHaveText('Save', { timeout: 5000 });
    }

    async assignWarehouse(warehouses, variantName) {
        // await this.selectors.backButton.click();
        await this.selectors.assignWarehouseButton.click();
        await this.selectors.assignWarehousePopup.waitFor({ state: 'visible' });
        for (let warehouse of warehouses) {
            await this.page.locator('tr', { hasText: warehouse.name }).locator('input').click();
        }
        await this.page.locator('button', { hasText: "Confirm" }).click();
        await this.page.locator('span', { hasText: "Variant Name" }).waitFor({ state: 'visible' });
        await this.selectors.productSubmitButton.click();
        await expect(this.selectors.productSubmitButton).toHaveText('Save', { timeout: 5000 });
        await this.page.locator('span', { hasText: "Warehouse Name" }).waitFor({ state: 'visible' });

        for (let warehouse of warehouses) {
            await this.page.locator(`[data-test-id="${warehouse.name}"]`).locator('[data-test-id="stock-input"]').fill(String(warehouse.quantity));
        }
        // const warehouseTable = await this.page.locator('table', { has: this.page.locator('span', { hasText: "Warehouse Name" }) });
        // await warehouseTable.scrollIntoViewIfNeeded();

        // const lookup = new Map(warehouses.map(i => [i.name, i.quantity]));
        // const rows = await warehouseTable.locator('tr');
        // const count = await rows.count();

        // for (let i = 0; i < count; i++) {
        //     const row = rows.nth(i);
        //     const id = await row.getAttribute('data-test-id');
        //     if (!id) continue;
        //     const qty = lookup.get(id);
        //     if (qty !== undefined) {
        //         const input = row.locator('input[data-test-id="stock-input"]');
        //         await input.fill(String(qty));
        //         // optionally trigger blur or Enter if the app reacts on change
        //         // await input.press('Enter');
        //     }
        // }
        await expect(this.selectors.productSubmitButton).toBeEnabled();
        await this.selectors.productSubmitButton.click();
        await expect(this.selectors.productSubmitButton).toHaveText('Save', { timeout: 5000 });

    }

    async priceUpdate(updatedPrices) {

        await this.page.locator('[data-test-id="product-variant-pricing-channel-list"]').waitFor({ state: 'visible' });

        for (let channel of updatedPrices) {
            // console.log(channel.name);
            await this.page
                .locator(`[data-test-id="${channel.name}"]`)
                .locator('input[data-test-id="price-field"]')
                .clear();
            await this.page
                .locator(`[data-test-id="${channel.name}"]`)
                .locator('input[data-test-id="price-field"]')
                .fill(channel.sellingPrice);

            await this.page
                .locator(`[data-test-id="${channel.name}"]`)
                .locator('input[data-test-id="cost-price-field"]')
                .clear();
            await this.page
                .locator(`[data-test-id="${channel.name}"]`)
                .locator('input[data-test-id="cost-price-field"]')
                .fill(channel.costPrice);
        }

        // for (let updatedPrice of updatedPrices) {
        //     // console.log(updatedPrice.name);
        //     await this.page
        //         .locator('tr', { has: this.page.locator('td', { hasText: updatedPrice.name }) })
        //         .first()
        //         .locator('input[data-test-id="price-field"]')
        //         .fill(String(updatedPrice.sellingPrice));

        //     await this.page
        //         .locator('tr', { has: this.page.locator('td', { hasText: updatedPrice.name }) })
        //         .first()
        //         .locator('input[data-test-id="cost-price-field"]')
        //         .fill(String(updatedPrice.costPrice));
        // }
        await expect(this.selectors.productSubmitButton).toBeEnabled();
        await this.selectors.productSubmitButton.click();
        await expect(this.selectors.productSubmitButton).toHaveText('Save', { timeout: 5000 });
    }



    async addVariant(variant) {
        await this.selectors.addVariantButton.waitFor({ state: 'visible' });
        await this.selectors.addVariantButton.click();
        await this.page.locator('span', { hasText: "Create Variant" }).waitFor({ state: 'visible' });
        await this.selectors.variantNameInput.fill(variant.name);
        for (let channel of variant.channels) {
            console.log(channel.name);
            await this.page
                .locator(`[data-test-id="${channel.name}"]`)
                .locator('input[data-test-id="price-field"]')
                .fill(channel.sellingPrice);

            await this.page
                .locator(`[data-test-id="${channel.name}"]`)
                .locator('input[data-test-id="cost-price-field"]')
                .fill(channel.costPrice);
        }

        if (Object.keys(variant).length === 2 && 'name' in variant && 'channels' in variant) {
            // skip
        } else {
            await this.page.locator('input[name="weight"]').fill(String(variant.weight));
            await this.selectors.productSKU.fill(variant.sku);
            if (variant.trackInventory) {
                await this.selectors.trackInventory.click();
            }

        }

        await this.selectors.productSubmitButton.click();
        await expect(this.selectors.productSubmitButton).toBeEnabled();
        await this.selectors.successMessage.waitFor({ state: 'visible' });
        await this.selectors.successMessage.waitFor({ state: 'hidden' });
        // await expect(this.selectors.productSubmitButton).toHaveText('Save variant', { timeout: 5000 });

    }

    async verifyAvailabilityDate(channel) {
        await this.selectors.productAvailabilitySection.locator('span', { hasText: channel }).click();
        // await this.page.locator('span', { hasText: "Available for purchase" }).waitFor({ state: 'visible' });
        await this.selectors.availabilityDate.waitFor({ state: 'visible' });
        const availableDate = await this.selectors.availabilityDate.innerText();
        console.log(availableDate);
        const datePart = availableDate.replace(/^Scheduled for\s*/i, '');
        const dt = new Date(`${datePart} UTC`);
        const uiIso = dt.toISOString();

        return uiIso;

    }

    async getAllListedProductNames() {
        const allNames = [];

        while (true) {
            await this.page.locator('table[role="grid"] tbody tr').first().waitFor({ state: 'attached' });

            const nameCells = this.page.locator('td[role="gridcell"][aria-colindex="1"]');
            const count = await nameCells.count();

            const firstNameBeforeNav = count > 0 ? (await nameCells.first().textContent()).trim() : null;

            for (let i = 0; i < count; i++) {
                allNames.push((await nameCells.nth(i).textContent()).trim());
            }

            const isNextDisabled = await this.selectors.nextPage.isDisabled();
            if (isNextDisabled) break;

            await this.selectors.nextPage.click();

            // Wait for the grid to actually reload — the DOM structure persists
            // across pagination (same table, same testids), so 'attached'/'visible'
            // won't tell you new data has landed. Poll until the first row's text
            // changes from what it was before navigating.
            await this.page.waitForFunction(
                (previousFirstName) => {
                    const cell = document.querySelector('td[role="gridcell"][aria-colindex="2"]');
                    return cell && cell.textContent.trim() !== previousFirstName;
                },
                firstNameBeforeNav,
                { timeout: 10000 }
            );
        }
        while (true) {
            await this.page.locator('table[role="grid"] tbody tr').first().waitFor({ state: 'attached' });
            const isPreviousDisabled = await this.selectors.previousPage.isDisabled();
            if (isPreviousDisabled) break;

            await this.selectors.previousPage.click();

            // await this.page.waitForFunction(
            //     (previousFirstName) => {
            //         const cell = document.querySelector('td[role="gridcell"][aria-colindex="2"]');
            //         return cell && cell.textContent.trim() !== previousFirstName;
            //     },
            //     firstNameBeforeNav,
            //     { timeout: 10000 }
            // );
        }

        return allNames;
    }

    async navigateToProduct(productName) {

        const matchingCell = this.page.locator('td[role="gridcell"]', { hasText: productName }).first();
        await matchingCell.waitFor({ state: 'attached' }); // NOT 'visible' — attribute reads don't need layout

        const colIndex = parseInt(await matchingCell.getAttribute('aria-colindex'), 10);
        const row = matchingCell.locator('xpath=ancestor::tr[1]');
        const rowIndex = parseInt(await row.getAttribute('aria-rowindex'), 10);
        const totalRows = parseInt(await this.page.locator('table[role="grid"]').getAttribute('aria-rowcount'), 10);

        const canvas = this.page.locator('canvas[data-testid="data-grid-canvas"]');
        const canvasBox = await canvas.boundingBox(); // real element, real layout — this one works

        const rowHeight = canvasBox.height / totalRows; // averaged, not exact, but consistent for uniform rows
        const headerHeight = rowHeight; // header row counts as row 1 typically — verify against screenshot's header canvas height

        const targetY = canvasBox.y + headerHeight + (rowIndex - 2) * rowHeight + rowHeight / 2; // rowIndex often 1-based incl. header
        const targetX = canvasBox.x + 100; // approximate column offset — refine per column if needed

        await this.page.mouse.click(targetX, targetY);

        await this.selectors.productTitle.waitFor({ state: 'visible' });

    }

    async deleteWarningDisplay() {
        // await this.selectors.productDeleteButton.waitFor({ state: 'visible' });
        // await this.selectors.productDeleteButton.click();
        await this.selectors.showMoreButton.waitFor({ state: 'visible' });
        await this.selectors.showMoreButton.click();
        await this.selectors.deleteProductButton.waitFor({ state: 'visible' });
        await this.selectors.deleteProductButton.click();
        await this.selectors.deleteProductAlert.waitFor({ state: 'visible' });
        const isVisible = await this.selectors.deleteProductAlert.isVisible();
        return isVisible;
    }

    async deleteTestProduct() {
        await this.page.locator('[data-test-id="submit"]').click();
        await this.selectors.deleteProductAlert.waitFor({ state: 'hidden' });
    }
}

module.exports = ProductsPage;