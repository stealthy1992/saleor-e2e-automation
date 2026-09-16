const { expect } = require('@playwright/test');
const BasePage = require('./BasePage');

class CategoryPage extends BasePage{
    constructor(page) {
        super(page);
        this.page = page;
        this.selectors = {
            createCategoryButton: page.getByTestId('create-category'),
            categoryTitleInput: page.locator('[name="name"]'),
            descriptionBox: page.getByTestId('category-description-input'),
            editSEOButton: page.getByTestId('edit-seo'),
            categorySubmitButton: page.getByTestId('submit'),
            categoryPage: page.locator('h2', { hasText: 'General Information' }),
            createSubcategoryButton: page.getByTestId('create-subcategory'),
            backButton: page.getByTestId('app-header-back-button'),
            categoryCreateSuccess: page.locator('span', { hasText: 'Category created' }),
            categoryUpdateSuccess: page.locator('span', { hasText: 'Category updated' }),
            categoryDeleteSuccess: page.locator('span', { hasText: 'Category deleted' }),
            nextPage: page.getByTestId('button-pagination-next'),
            previousPage: page.getByTestId('button-pagination-back'),
            emptyFieldError: page.locator('[data-test-type="error"]').locator('span', { hasText: 'This field cannot be blank.' }),
            slugInput: page.getByRole('textbox', { name: 'slug' }),
            duplicateSlugError: page.locator('span', { hasText: "Category with this Slug already exists." }),
            deletionAlert: page.getByText('Are you sure you want to delete', { exact: false }),
            deleteButton: page.getByTestId('button-bar-delete'),
            deleteButtonInsideAlert: page.locator('[data-test-id="submit"]', { hasText: 'Delete' }),
            productsTab: page.getByTestId('products-tab'),
            addProductsButton: page.getByTestId('assign-product'),
            
            subcategoryNameField: page.getByTestId('create-category-dialog').getByTestId('category-name-input'),
            categoryPageSubmit: page.getByTestId('button-bar-confirm'),
            showMoreButton: page.getByTestId('show-more-button'),
            deleteCategoryListItem: page.getByTestId('delete-category'),


        }
    }

   

    // async navigateToAssignedProducts() {
    //     // await this.selectors.productsTab.waitFor({ state: 'visible' });
    //     // await this.selectors.productsTab.click();
    //     await this.selectors.addProductsButton.waitFor({ state: 'visible' });
    //     await this.selectors.addProductsButton.click();
    //     await this.page.locator('span', { hasText: 'Assign product' }).waitFor({ state: 'visible' });
    // }

    async confirmDeletion() {
        await this.selectors.deleteButtonInsideAlert.waitFor({ state: 'visible' });
        await this.selectors.deleteButtonInsideAlert.click();
        await this.selectors.categoryDeleteSuccess.waitFor({ state: 'visible' });
        const updatedCategoryList = await this.fetchCategories();
        return updatedCategoryList;
    }

    async deletionWarning() {
        await this.selectors.showMoreButton.waitFor({ state: 'visible' });
        await this.selectors.showMoreButton.click();
        await this.selectors.deleteCategoryListItem.waitFor({ state: 'visible' });
        await this.selectors.deleteCategoryListItem.click();
        try {
            await this.selectors.deletionAlert.waitFor({ state: 'visible', timeout: 5000 });
            return true;
        } catch {
            return false;
        }
    }

    async fetchCurrentSlug() {
        await this.dismissAnnouncement();
        await this.selectors.editSEOButton.click();
        await this.selectors.slugInput.waitFor({ state: 'visible' });
        const slugValue = await this.selectors.slugInput.inputValue();
        return slugValue;
    }

    async updateCategoryTitle(name) {
        await this.selectors.categoryTitleInput.fill('');
        await this.selectors.categoryTitleInput.fill(name);
        await this.selectors.categoryPageSubmit.click();
        await expect(this.selectors.categoryPageSubmit).toHaveText('Save', { timeout: 5000 });
        const updatedValue = await this.selectors.categoryTitleInput.inputValue();
        expect(updatedValue).toBe(name);
    }

    async slugDuplicationValidation(slug) {
        await this.dismissAnnouncement();
        await this.selectors.editSEOButton.click();
        await this.selectors.slugInput.waitFor({ state: 'visible' }); 
        await this.selectors.slugInput.fill(slug);
        await expect(this.selectors.categoryPageSubmit).toBeEnabled();
        await this.selectors.categoryPageSubmit.click();
        try {
            await this.page.locator('[data-test-type="error"]').waitFor({ state: 'visible', timeout: 5000 });
            return true;
        } catch {
            return false;
        }
    }

    async assertValidationError(restoreName) {
        await this.selectors.categoryPage.waitFor({ state: 'visible' });
        await this.selectors.categoryTitleInput.fill('');
        await expect(this.selectors.categoryPageSubmit).toBeDisabled();
        const isEnabled = await this.selectors.categoryPageSubmit.isEnabled();
        await this.selectors.categoryTitleInput.fill(restoreName);
        // await expect(this.selectors.categoryPageSubmit).toBeEnabled();
        // await this.selectors.categoryPageSubmit.click();
        return isEnabled;
    }

    async fetchCategories() {

        const allNames = [];

        while (true) {
            await this.page.locator('table[role="grid"] tbody tr').first().waitFor({ state: 'attached' });

            const nameCells = this.page.locator('td[role="gridcell"][aria-colindex="2"]');
            const count = await nameCells.count();
            console.log(`Name cells count is ${count}`)
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


    async navigateToParentCategory(categoryName) {

        const matchingCell = this.page.locator('td[role="gridcell"]', { hasText: categoryName }).first();
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

        await this.selectors.categoryPage.waitFor({ state: 'visible' });

    }

    async fetchGeneratedSlug() {
        await this.selectors.editSEOButton.waitFor({ state: 'visible' });
        await this.selectors.editSEOButton.click();
        await this.selectors.slugInput.waitFor({ state: 'visible' });
        const slugValue = await this.selectors.slugInput.inputValue();
        return slugValue;
    }

    async createCategory(category) {
        await this.selectors.createCategoryButton.waitFor({ state: 'visible' });
        await this.dismissAnnouncement();
        await this.selectors.createCategoryButton.click();
        await this.page.locator('span', { hasText: 'Create category' }).waitFor({ state: 'visible' });
        await this.selectors.categoryTitleInput.fill(category.name);
        await this.selectors.descriptionBox.type(category.description, { delay: 20 });
        await this.selectors.categorySubmitButton.click();
    }

    async createChildCategory(category) {
        await this.selectors.createSubcategoryButton.click();
        await this.page.locator('span', { hasText: 'Create subcategory' }).waitFor({ state: 'visible' });
        await this.selectors.subcategoryNameField.fill(category.name);
        await this.selectors.descriptionBox.type(category.description, { delay: 20 });
        await this.selectors.categorySubmitButton.click();
        await this.selectors.categoryCreateSuccess.waitFor({ state: 'visible' });
        await this.selectors.backButton.click();
        await this.page.locator('h2', { hasText: 'Subcategories' }).waitFor({ state: 'visible' });

    }
}

module.exports = CategoryPage;