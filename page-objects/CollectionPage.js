const { expect } = require('@playwright/test');
const BasePage = require('./BasePage');

class CollectionPage extends BasePage{
    constructor(page) {
        super(page);
        this.page = page;
        this.selectors = {
            createCollectionButton: page.getByTestId('create-collection'),
            addCollectionPage: page.locator('[title="Add Collection"]'),
            collectionTitleInput: page.getByTestId('collection-name-input'),
            descriptionBox: page.locator('.codex-editor [contenteditable="true"]'),
            saveCollectionButton: page.getByTestId('button-bar-confirm'),
            successMessage: page.locator('[data-test-type="success"]'),
            editSEOButton: page.getByTestId('edit-seo'),
            slugInput: page.locator('[name="slug"]'),
            assignProductButton: page.getByTestId('add-product'),
            productTableRows: page.getByTestId('assign-product-table-row'),
            dialogBox: page.locator('[role="dialog"]'),
            submitButton: page.getByTestId('submit'),
            deleteButton: page.getByTestId('button-bar-delete'),
            searchInput: page.getByTestId('search-input'),
            nextPage: page.getByTestId('button-pagination-next'),
            previousPage: page.getByTestId('button-pagination-back'),
            filterButton: page.getByTestId('filters-button'),
            addFilterButton: page.getByTestId('add-filter-button'),
            filterCategory: page.getByTestId('left-0'),
            filterValueDropdown: page.getByTestId('right-0'),
            saveFiltersButton: page.getByTestId('save-filters-button'),
            whereClause: page.locator('span', { hasText: 'Where' }),
            categoryDescriptionInput: page.getByTestId('collection-description-input'),
            manageChannelButton: page.getByTestId('channels-availability-manage-button'),
            availableChannelList: page.getByTestId('manage-products-channels-availiability-list'),
            showMoreButton: page.getByTestId('show-more-button'),
            deleteCollection: page.getByTestId('delete-collection'),

        }
    }

    async clearSearchInput() {
        await this.selectors.searchInput.waitFor({ state: 'visible' });
        await this.selectors.searchInput.fill('');
        await this.page.waitForTimeout(1000)
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
        await this.selectors.saveFiltersButton.click();
        await this.page.locator('table[role="grid"] tbody tr').first().waitFor({ state: 'attached' });
    }

    async addFilterOnCollections(filterType, filterValue) {
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

    async searchCollection(keyword) {
        await this.selectors.searchInput.waitFor({ state: 'visible' });
        await this.selectors.searchInput.fill(keyword);
        await this.page.waitForTimeout(1000)
        const searchedCategories = await this.getAllCategoryNames();
        return searchedCategories;
    }

    async getAllCategoryNames() {
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
        }

        return allNames;
    }

    async fetchCollections() {
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
        }

        return allNames;
    }

    async deleteProductFromCollection(product) {
        await this.selectors.productTableRows.first().waitFor({ state: 'visible' });
        const productCount = await this.selectors.productTableRows.count();
        console.log(`Product in this collection are ${productCount}`);
        for (let i = 0; i < productCount; i++) {
            const currentProduct = await this.selectors.productTableRows.nth(i).locator('td').nth(2).innerText();
            console.log(currentProduct);
            if (currentProduct === product.name) {
                await this.selectors.productTableRows.nth(i).locator('[data-test-id="delete-icon"]').click();
                break;
            }
        }
        await this.selectors.successMessage.waitFor({ state: 'visible' });
    }

    async navigateToCollection(collectionName) {

        const matchingCell = this.page.locator('td[role="gridcell"]', { hasText: collectionName }).first();
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

        await this.selectors.collectionTitleInput.waitFor({ state: 'visible' });
    }

    async deleteCollection(collectionName) {
        // await this.page.getByText(collectionName, { exact: true }).locator('span').waitFor({ state: 'visible' });
        await this.selectors.showMoreButton.click();
        await this.selectors.deleteCollection.waitFor({ state: 'visible' });
        await this.selectors.deleteCollection.click();
        // await this.selectors.deleteButton.click();
        await this.selectors.dialogBox.waitFor({ state: 'visible' });
        await this.selectors.submitButton.click();
        await this.selectors.successMessage.waitFor({ state: 'visible' });
    }

    // async assignProductToCollection(productName) {
    //     await this.selectors.assignProductButton.click();
    //     await this.selectors.dialogBox.waitFor({ state: 'visible' });
    //     const productCount = await this.selectors.productTableRows.count();
    //     for (let i = 0; i < productCount; i++) {
    //         const currentProduct = await this.selectors.productTableRows.nth(i).locator('td').last().innerText();
    //         console.log(currentProduct);
    //         if (currentProduct === productName) {
    //             await this.selectors.productTableRows.nth(i).locator('input[type="checkbox"]').click();
    //             break;
    //         }
    //     }
    //     await this.selectors.submitButton.click();
    //     // await this.selectors.assignProductButton.waitFor({ state: 'visible'});
    //     // await this.selectors.dialogBox.waitFor({ state: 'hidden' });
    //     await expect(this.selectors.dialogBox).toBeHidden();
    // }

    async updateCollection(collection) {
        // await this.page.locator('span', { hasText: 'General Information' }).waitFor({ state: 'visible' });
        await this.selectors.collectionTitleInput.fill('');
        await this.selectors.collectionTitleInput.fill(collection.name);
        await this.page.evaluate(() => {
            const el = document.querySelector('.codex-editor [contenteditable="true"]');
            if (!el) return;
            el.innerText = '';
            el.dispatchEvent(new InputEvent('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await this.page.waitForTimeout(500);
        await this.selectors.descriptionBox.type(collection.description, { delay: 20 });
        await this.selectors.saveCollectionButton.click();
        await this.selectors.successMessage.waitFor({ state: 'visible' });
    }

    async toggleChannelOn(channel) {
        await this.page.locator('span', { hasText: 'Availability' }).first().waitFor({ state: 'visible' });
        await this.selectors.manageChannelButton.click();
        await this.page.locator('span', { hasText: 'Manage Collection Channel Availability'}).waitFor({ state: 'visible' });
        const availableChannelsList = await this.page.locator('[data-test-id="channel-row"]');
        const channelCount = await availableChannelsList.count();
        for(let i=0; i < channelCount; i++ ){
            const currentChannel = await availableChannelsList.nth(i).innerText();
            if(currentChannel.trim() === channel){
                await availableChannelsList.nth(i).locator('input').click();
                await this.selectors.submitButton.click();
                break;
            }
        }
        await expect(this.selectors.saveCollectionButton).toBeEnabled();
        await this.selectors.saveCollectionButton.click();
        await this.selectors.successMessage.waitFor({ state: 'visible' });
        // const currentChannel = await this.page.locator('[data-macaw-ui-component="Accordion.Item"]', { has: this.page.locator('span', { hasText: channel }) });
        // await currentChannel.click();
        // await expect(currentChannel).toHaveAttribute('data-state', 'open', { timeout: 5000 });
        // const checked = await currentChannel.locator('[role="radio"][aria-checked="true"]').getAttribute('value');
        // console.log('Checked is:', checked);
        // if (checked === 'false') {
        //     await this.page.locator('[role="radio"][aria-checked="false"]').click();
        // }
        // await currentChannel.click();
    }

    async createCollection(collection) {
        await this.selectors.createCollectionButton.waitFor({ state: 'visible' });
        await this.selectors.createCollectionButton.click();
        // await this.selectors.addCollectionPage.waitFor({ state: 'visible' });
        await this.page.locator('span', { hasText: 'Create collection'}).waitFor({ state: 'visible'});
        await this.selectors.collectionTitleInput.fill(collection.name);
        await this.selectors.categoryDescriptionInput.fill(collection.description);
        
        await expect(this.selectors.submitButton).toBeEnabled();
        await this.selectors.submitButton.click();
        // for (let channel of collection.channels) {
        //     const currentChannel = await this.page.locator('[data-macaw-ui-component="Accordion.Item"]', { has: this.page.locator('span', { hasText: channel }) });
        //     await currentChannel.click();
        //     await expect(currentChannel).toHaveAttribute('data-state', 'open', { timeout: 5000 });
        //     const checked = await currentChannel.locator('[role="radio"][aria-checked="true"]').getAttribute('value');
        //     console.log('Checked is:', checked);
        //     if (checked === 'false') {
        //         await this.page.locator('[role="radio"][aria-checked="false"]').click();
        //     }
        //     await currentChannel.click();
        // }
        // await this.selectors.saveCollectionButton.click();
        await this.selectors.successMessage.waitFor({ state: 'visible' });
    }

    async fetchCurrentSlug() {
        await this.dismissAnnouncement();
        await this.selectors.editSEOButton.waitFor({ state: 'visible' });
        await this.selectors.editSEOButton.click();
        await this.selectors.slugInput.waitFor({ state: 'visible' });
        const currentValue = await this.selectors.slugInput.inputValue();
        return currentValue;
    }
}

module.exports = CollectionPage;