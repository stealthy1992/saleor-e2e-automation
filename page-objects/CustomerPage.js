const BasePage = require('./BasePage');
const { expect } = require('@playwright/test');

class CustomerPage extends BasePage {
    constructor(page) {
        super(page);
        this.page = page;
        this.selectors = {
            nextPage: page.getByTestId('button-pagination-next'),
            previousPage: page.getByTestId('button-pagination-back'),
            searchInput: page.getByTestId('search-input'),
            firstNameField: page.getByTestId('customer-first-name'),
            lastNameField: page.getByTestId('customer-last-name'),
            emailField: page.getByTestId('customer-email'),
            customerOverviewSection: page.getByTestId('customer-overview'),
            addressSection: page.getByTestId('address'),
            nameOnAddress: page.getByTestId('name'),
            postalCodeAndCity: page.getByTestId('postal-code-and-city'),
            areaAndCountry: page.getByTestId('country-area-and-country'),
            addressLine1: page.getByTestId('addressLines').locator('span').first(),
            saveButton: page.getByTestId('button-bar-confirm'),
            successMessage: page.locator('[data-test-type="success"]'),
            showMoreButton: page.getByTestId('show-more-button'),
            deactivateUserButton: page.getByTestId('deactivate-user'),
            activateUserButton: page.getByTestId('activate-user'),

            deactivationPrompt: page.locator('span', { hasText: 'Are you sure you want to deactivate' }),
            deactivateConfirmButton: page.locator('button', { hasText: 'Deactivate'}),
            activateConfirmButton: page.locator('button', { hasText: 'Activate'}),
            statusDeactivate: page.locator('[data-test-id="account-status-inactive"]'),
            statusActivate: page.getByTestId('account-status-active'),
            deleteCustomerButton: page.getByTestId('delete-user'),
            deleteCustomerModal: page.locator('span', { hasText: 'Are you sure you want to delete'}),
            deleteConfirmButton: page.locator('button', { hasText: 'Delete'}),
            customerDeletionSuccess: page.locator('span', { hasText: 'Customer removed', exact: true }),
            errorAlert: page.locator('[data-test-type="error"]'),
            invalidEmailError: page.locator('span', { hasText: 'Enter a valid email address.'}),
            closeAlertButton: page.locator('button[aria-label="Close notification"]'),

        }
    }

    async editEmail(email){
        await this.selectors.emailField.waitFor({ state: 'visible' });
        await this.selectors.emailField.fill(email);
        await expect( this.selectors.saveButton).toBeEnabled();
        await this.selectors.saveButton.click();
        await expect(this.selectors.errorAlert).toBeVisible();
        const isErrorVisible = await this.selectors.errorAlert.isVisible();
        await this.selectors.closeAlertButton.click();
        await this.selectors.errorAlert.waitFor({ state: 'hidden' });
        return isErrorVisible;
    }

    async attemptCustomerDeletion(){
        await this.selectors.showMoreButton.waitFor({ state: 'visible' }),
        await this.selectors.showMoreButton.click();
        await this.selectors.deleteCustomerButton.waitFor({ state: 'visible' });
        await this.selectors.deleteCustomerButton.click();
        await this.selectors.deleteCustomerModal.waitFor({ state: 'visible' });
        const isPromptDisplayed = await this.selectors.deleteCustomerModal.isVisible();
        return isPromptDisplayed;
    }

    async deleteCustomer(){
        await this.selectors.deleteConfirmButton.click();
        await this.selectors.deleteCustomerModal.waitFor({ state: 'hidden' });
        await expect(this.selectors.customerDeletionSuccess).toBeVisible();
        const isDeletionSuccessful = await this.selectors.customerDeletionSuccess.isVisible();
        return isDeletionSuccessful;
    }

    async activateCustomer(){
        await this.selectors.showMoreButton.waitFor({ state: 'visible' }),
        await this.selectors.showMoreButton.click();
        await this.selectors.activateUserButton.waitFor({ state: 'visible' });
        await this.selectors.activateUserButton.click();
        await this.selectors.activateConfirmButton.waitFor({ state: 'visible' });
        await this.selectors.activateConfirmButton.click();
        await this.page.locator('span', { hasText: 'Customer activated'}).waitFor({ state: 'visible' });
        await expect(this.selectors.statusActivate).toBeVisible();
        const status = (await this.selectors.statusActivate.innerText()).trim();
        return status;
    }

    async deactivateCustomer(){
        await this.selectors.showMoreButton.waitFor({ state: 'visible' }),
        await this.selectors.showMoreButton.click();
        await this.selectors.deactivateUserButton.waitFor({ state: 'visible' });
        await this.selectors.deactivateUserButton.click();
        await this.selectors.deactivationPrompt.waitFor({ state: 'visible' });
        await this.selectors.deactivateConfirmButton.click();
        await this.page.locator('span', { hasText: 'Customer deactivated'}).waitFor({ state: 'visible' });
        await expect(this.selectors.statusDeactivate).toBeVisible();
        const status = (await this.selectors.statusDeactivate.innerText()).trim();
        return status;
    }

    async updateCustomerInfo(updatedName){
        await this.selectors.firstNameField.fill(updatedName.firstName);
        await this.selectors.lastNameField.fill(updatedName.lastName);
        await expect(this.selectors.saveButton).toBeEnabled();
        await this.selectors.saveButton.click();
        await this.selectors.successMessage.waitFor({ state: 'visible' });
        const updatedFirstName = await this.selectors.firstNameField.inputValue();
        const updatedLastName = await this.selectors.lastNameField.inputValue();
        return {
            firstName: updatedFirstName,
            lastName: updatedLastName
        }
    }

    async fetchAddress() {
        await this.selectors.addressSection.waitFor({ state: 'visible' });
        const container = this.selectors.addressSection; // scoped to the address <address> element

        const name = (await container.getByTestId('name').innerText()).trim();
        const streetAddress1 = (await container.getByTestId('addressLines').locator('span').first().innerText()).trim();
        const postalCodeAndCity = (await container.getByTestId('postal-code-and-city').innerText()).trim();
        const countryAreaAndCountry = (await container.getByTestId('country-area-and-country').innerText()).trim();

        const [postalCode, ...cityParts] = postalCodeAndCity.split(' ');
        const city = cityParts.join(' ');
        const [countryArea, country] = countryAreaAndCountry.split(',').map(s => s.trim());

        return { name, streetAddress1, postalCode, city, countryArea, country };
    }

    normalizeUIOrder(o) {
        return {
            number: Number(o.orderNumber.replace('#', '')),
            status: o.orderStatus.toLowerCase(),
            total: parseFloat(o.orderTotal.replace(/[A-Z]/g, '')), // strip currency letters, keep the number
            currency: o.orderTotal.match(/[A-Z]+/)[0],
        };
    }
    normalizeDBOrder(o) {
        return {
            number: o.number,
            status: o.status.toLowerCase(),
            total: parseFloat(o.total_net_amount),
            currency: o.currency,
        };
    }

    async fetchCustomerOrders() {
        let uiOrders = [];
        const orders = await this.page.getByTestId('customer-order-row');
        const orderCount = await orders.count();
        for (let i = 0; i < orderCount; i++) {
            const orderStatus = await orders.nth(i).locator('[data-test-id="customer-order-status"]').innerText();
            const orderTotal = await orders.nth(i).locator('[data-test-id="money-value"]').innerText();
            const orderChannel = await orders.nth(i).locator('[data-test-id="channel-display"]').innerText();
            const orderTimestamp = await orders.nth(i).locator('td').nth(2).innerText();
            const orderNumber = await orders.nth(i).locator('td').nth(1).innerText();
            uiOrders.push({
                orderNumber: orderNumber,
                orderStatus: orderStatus,
                orderTotal: orderTotal,
                orderChannel: orderChannel,
                orderTimestamp: orderTimestamp
            })
        }
        return uiOrders;
    }

    async fetchCustomerDetails() {
        await this.selectors.firstNameField.waitFor({ state: 'visible' });
        const firstName = await this.selectors.firstNameField.inputValue();
        const lastName = await this.selectors.lastNameField.inputValue();
        const email = await this.selectors.emailField.inputValue();
        return { firstName, lastName, email };

    }

    async navigateToCustomer(customerEmail) {
        // Filter to a single row first. The old approach clicked at a computed
        // canvas pixel coordinate derived from (canvasBox.height / totalRows) —
        // that only holds if every row is simultaneously rendered on screen.
        // Once the customer list has more rows than fit in the viewport, that
        // math undershoots badly and the click lands on whatever row is
        // actually visible near the top, regardless of the intended target.
        await this.selectors.searchInput.fill(customerEmail);
        await this.waitForRowCountSettle();

        const rows = this.page.locator('table[role="grid"] tbody tr[role="row"]');
        await rows.first().waitFor({ state: 'attached' });
        const rowCount = await rows.count();
        if (rowCount !== 1) {
            throw new Error(`navigateToCustomer: expected exactly 1 row after searching "${customerEmail}", found ${rowCount}`);
        }
        const row = rows.first();

        const canvas = this.page.locator('canvas[data-testid="data-grid-canvas"]');
        const canvasBox = await canvas.boundingBox();
        const rowBox = await row.boundingBox();
        // Only one data row is rendered now, so there's no scroll/viewport
        // ambiguity — read height directly off this row instead of dividing
        // the canvas by a row count that no longer matches what's on screen.
        const rowHeight = rowBox ? rowBox.height : canvasBox.height / 2;
        const headerHeight = rowHeight;

        const targetY = canvasBox.y + headerHeight + rowHeight / 2;
        const targetX = canvasBox.x + 100;

        await this.page.mouse.click(targetX, targetY);
        await this.selectors.customerOverviewSection.waitFor({ state: 'visible' });

        // Fail loudly instead of silently proceeding on the wrong customer.
        const openedEmail = (await this.selectors.emailField.inputValue()).trim();
        if (openedEmail !== customerEmail) {
            throw new Error(`navigateToCustomer: expected to land on "${customerEmail}" but opened "${openedEmail}"`);
        }

        // Clear the filter so it doesn't leak into whatever runs next.
        // await this.selectors.searchInput.fill('');
    }

    async searchCustomer(keyword) {
        const rows = this.page.locator('table[role="grid"] tbody tr[role="row"]');
        const firstNameBefore = (await rows.count()) > 0
            ? (await rows.first().locator('td[aria-colindex="1"]').innerText()).trim()
            : null;

        await this.selectors.searchInput.fill(keyword);

        await this.page.waitForFunction(
            (previous) => {
                const cell = document.querySelector('td[role="gridcell"][aria-colindex="1"]');
                return !cell || cell.textContent.trim() !== previous;
            },
            firstNameBefore,
            { timeout: 10000 }
        );
        await this.waitForRowCountSettle();
        return this.fetchAllCustomers();
    }

    async waitForRowCountSettle({ checks = 3, interval = 100, timeout = 5000 } = {}) {
        const rows = this.page.locator('table[role="grid"] tbody tr[role="row"]');
        const start = Date.now();
        let lastCount = await rows.count();
        let stableCount = 0;
        while (Date.now() - start < timeout) {
            await this.page.waitForTimeout(interval);
            const current = await rows.count();
            if (current === lastCount) {
                stableCount++;
                if (stableCount >= checks) return;
            } else {
                stableCount = 0;
                lastCount = current;
            }
        }
        console.warn('waitForRowCountSettle: row count never stabilized within timeout — proceeding anyway');
    }

    async fetchAllCustomers() {
        const allCustomers = [];

        while (true) {
            const rows = this.page.locator('table[role="grid"] tbody tr[role="row"]');
            await rows.first().waitFor({ state: 'attached' }).catch(() => { }); // ok if genuinely zero rows
            await this.waitForRowCountSettle();
            const rowCount = await rows.count();

            const firstNameBeforeNav = rowCount > 0
                ? (await rows.first().locator('td[aria-colindex="1"]').innerText()).trim()
                : null;

            for (let i = 0; i < rowCount; i++) {
                const row = rows.nth(i);
                try {
                    const name = (await row.locator('td[aria-colindex="1"]').innerText({ timeout: 3000 })).trim();
                    const email = (await row.locator('td[aria-colindex="2"]').innerText({ timeout: 3000 })).trim();
                    const orderCount = (await row.locator('td[aria-colindex="3"]').innerText({ timeout: 3000 })).trim();
                    allCustomers.push({ name, email, orderCount });
                } catch (err) {
                    console.warn(`fetchAllCustomers: row ${i} did not stabilize — skipping. ${err.message}`);
                }
            }
            const isNextDisabled = await this.selectors.nextPage.isDisabled();
            if (isNextDisabled) break;

            await this.selectors.nextPage.click();

            await this.page.waitForFunction(
                (previousFirstName) => {
                    const cell = document.querySelector('td[role="gridcell"][aria-colindex="1"]');
                    return cell && cell.textContent.trim() !== previousFirstName;
                },
                firstNameBeforeNav,
                { timeout: 10000 }
            );
        }
        return allCustomers;
    }
}

module.exports = CustomerPage;