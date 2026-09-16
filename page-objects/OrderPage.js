const { expect } = require('@playwright/test');
const { query } = require('../utils/db-client');
const BasePage = require('./BasePage');

class OrderPage extends BasePage {
    constructor(page) {
        super(page);
        this.page = page;
        this.selectors = {
            nextPage: page.getByTestId('button-pagination-next'),
            previousPage: page.getByTestId('button-pagination-back'),
            canvas: page.getByTestId('data-grid-canvas'),
            orderSummary: page.getByTestId('OrderSummary'),
            backButton: page.getByTestId('app-header-back-button'),
            pageHeader: page.getByTestId('page-header'),
            subTotal: page.getByTestId('order-subtotal-line').locator('[data-test-id="amount"]'),
            orderTotal: page.getByTestId('order-total'),
            shippingCost: page.locator('[title="Shipping cost"]').locator('[data-test-id="amount"]'),
            taxAmount: page.locator('[title="Tax amount"]'),
            chargeStatus: page.getByTestId('payment-status-badges').locator('div').first().locator('span'),
            customerEmail: page.getByTestId('customer-email-section').locator('> div').last().locator('span'),
            fulfillButton: page.getByTestId('order-items-fulfill-button'),
            selectWarehouseButton: page.getByTestId('select-warehouse-button'),
            confirmButton: page.getByTestId('button-bar-confirm'),
            fulfilledOrderSection: page.getByTestId('fulfilled-order-section'),
            unfulfilledOrderLinesSection: page.getByText('Unfulfilled order lines'),
            filterButton: page.getByTestId('filters-button'),
            addFilterButton: page.getByTestId('add-filter-button'),
            filterCategory: page.getByTestId('left-0'),
            filterValueDropdown: page.getByTestId('right-0'),
            saveFiltersButton: page.getByTestId('save-filters-button'),
            whereClause: page.locator('span', { hasText: 'Where' }),
            searchInput: page.getByTestId('search-input'),
            condition: page.getByTestId('condition-0'),
            commentArea: page.locator('textarea[name="message"]'),
            noteCards: page.locator('[data-note-card="true"]'),
            showMoreButton: page.getByTestId('show-more-button'),
            cancelOrderButton: page.locator('li', { hasText: 'Cancel order' }),
            orderStatusBadge: page.getByTestId('status-info'),
            warehouseList: page.getByTestId('warehouses-list'),
            totalCaptured: page.locator('li', { has: page.locator('span', { hasText: 'Total captured', exact: true }) }).locator('[data-test-id="amount"]'),
            outstandingBalance: page.locator('li', { has: page.locator('span', { hasText: 'Outstanding balance', exact: true }) }).locator('[data-test-id="amount"]'),
            orderReturnButton: page.getByTestId('order-items-return-button'),
            returnOrderPageTitle: page.locator('span', { hasText: 'Return & replace products', exact: true }).first(),
            transactionSelector: page.getByTestId('transaction-selector'),
            returnReasonInput: page.getByTestId('returnReasonInput'),
            automaticRefundOption: page.locator('button[value="automatic"]'),
            submitButton: page.getByTestId('submit'),
            grantAutoRefundButton: page.getByTestId('auto-grant-refund-checkbox').locator('button'),
            priceField: page.getByTestId('price-field'),
            autoGrantRefundCheckbox: page.locator('[name="autoGrantRefund"]'),
            autoSendRefundCheckbox: page.locator('[name="autoSendRefund"]'),
            orderDetailsSection: page.getByTestId('order-details-items-section'),

        }
    }

    async fetchOrderNumber(number) {
        await this.selectors.orderDetailsSection.waitFor({ state: 'visible' });
        const orderNumberEl = await this.page.locator('div[data-test-id="page-header"] div', { hasText: `Order #${number}`}).first().isVisible();
        return orderNumberEl;
        // const orderNumber = uiOrderID.replace('Order #', '').trim();
        // return orderNumber;
    }

    async processPartialRefund(productName) {
        let listedPrice;
        await this.selectors.orderReturnButton.waitFor({ state: 'visible' });
        await this.selectors.orderReturnButton.click();
        await this.selectors.returnOrderPageTitle.waitFor({ state: 'visible' });
        const listedProducts = await this.page.locator('tbody tr');
        const productCount = await listedProducts.count();
        console.log('Row count is: ', productCount);
        for (let i = 0; i < productCount; i++) {
            const productTitle = await listedProducts.nth(i).locator('[data-test-id="table-cell-avatar"]').innerText();
            console.log(productTitle);
            if (productTitle.trim() === productName) {
                await listedProducts.nth(i).locator('input[type="number"]').fill('1');
                const rawPrice = await listedProducts.nth(i).locator('[data-test-id="money-value"]').innerText();
                listedPrice = rawPrice.replace(/[^0-9.]/g, '');
            }
        }
        // const returnOrderButton = await this.page.getByTestId('set-maximal-quantity-unfulfilled-button').first();
        // await returnOrderButton.click();
        await this.selectors.returnReasonInput.fill('The product stock caught fire');
        await this.page.getByRole('radio', { name: 'Automatic Amount' }).click();
        // await this.selectors.autoGrantRefundCheckbox.click();
        // await this.page.getByRole('combobox', { name: 'Select transaction' }).click();
        // await this.page.getByRole('option').first().click();
        // await this.selectors.autoSendRefundCheckbox.waitFor({ state: 'visible'});
        // await this.selectors.autoSendRefundCheckbox.click();
        // await this.page.getByRole('combobox', { name: 'Select a reason type' }).click();
        // await this.page.getByRole('option').nth(1).click();
        await expect(this.selectors.submitButton).toBeEnabled();
        await this.selectors.submitButton.click();
        await this.selectors.orderStatusBadge.waitFor({ state: 'visible' });
        const partialRefundStatus = await this.selectors.orderStatusBadge.innerText();
        return { partialRefundStatus, listedPrice };
    }

    async processRefund() {
        await this.selectors.orderReturnButton.waitFor({ state: 'visible' });
        await this.selectors.orderReturnButton.click();
        await this.selectors.returnOrderPageTitle.waitFor({ state: 'visible' });
        const returnOrderButtons = await this.page.getByTestId('set-maximal-quantity-unfulfilled-button');
        const returnOrderButtonCount = await returnOrderButtons.count();
        console.log(`Button count is ${returnOrderButtonCount}`);
        for (let i = 0; i < returnOrderButtonCount; i++) {
            await returnOrderButtons.nth(i).click();
        }
        await this.selectors.returnReasonInput.fill('The order was lost at sea.');
        await this.selectors.automaticRefundOption.click();
        await expect(this.selectors.submitButton).toBeEnabled();
        await this.selectors.submitButton.click();
        await this.selectors.orderStatusBadge.waitFor({ state: 'visible' });
        const status = await this.selectors.orderStatusBadge.innerText();
        return status;
    }

    async dismissPulseAnnouncementIfPresent() {
        const dismissButton = this.page.locator('[data-test-id="ripple-video-announcement-dismiss"]');
        try {
            await dismissButton.waitFor({ state: 'visible', timeout: 3000 });
            await dismissButton.click();
        } catch {
            // not present this run — fine, nothing to do
        }
    }

    async cancelOrderFromDetailPage(orderNumber) {
        let orderStatus;
        const currentStatus = await this.selectors.orderStatusBadge.innerText();
        await this.selectors.pageHeader.locator('div', { hasText: `Order #${orderNumber}` }).first().waitFor({ state: 'visible' });
        await this.selectors.showMoreButton.first().waitFor({ state: 'visible' });
        await this.selectors.showMoreButton.first().click();
        await this.selectors.cancelOrderButton.waitFor({ state: 'visible' });
        await this.selectors.cancelOrderButton.click();
        if (currentStatus === 'Partially fulfilled') {
            await expect(
                this.page.locator('[role="dialog"]').locator('span', { hasText: 'Saleor couldn’t cancel order' })
            ).toBeVisible();
            orderStatus = currentStatus;

        }
        else {
            await this.page.locator('[role="dialog"]').locator('span', { hasText: `Cancel order #${orderNumber}` }).waitFor({ state: 'visible' });
            await this.page
                .locator('[role="dialog"]')
                .locator('button', { hasText: 'Cancel order' })
                .click();

            await this.page.locator('span', { hasText: 'Order cancelled' }).waitFor({ state: 'visible' });
            await this.selectors.orderStatusBadge.waitFor({ status: 'visible' });
            orderStatus = await this.selectors.orderStatusBadge.innerText();
            console.log(orderStatus);
        }

        return orderStatus;
    }

    async addANote(note) {
        await this.selectors.commentArea.waitFor({ state: 'visible' });
        await this.selectors.commentArea.fill(note);
        await this.page.locator('button', { hasText: 'Add Comment' }).click();
        await this.page.locator('span', { hasText: 'note added' }).waitFor({ state: 'visible' });
        const noteCardCount = await this.selectors.noteCards.count();
        console.log(noteCardCount);
        for (let i = 0; i < noteCardCount; i++) {
            const noteText = await this.selectors.noteCards.nth(i).locator('> div').last().locator('span').innerText();
            console.log(noteText);
            if (noteText.includes(note)) {
                return noteText;
                break;
            }
        }
    }

    async populateDateFilter(filterKeyInput, filterValueInput, dateType, dateCondition, dateValue) {
        console.log('Entered populteDate function')
        await this.page.locator(`[data-test-id="${filterKeyInput}"]`).fill(dateType);
        await this.page.getByTestId('select-option', { hasText: dateType }).waitFor({ state: 'visible' });
        await this.page.getByTestId('select-option', { hasText: dateType }).click();

        await this.page.locator('label', { hasText: 'lower' }).click();
        // await this.page.locator('label', { hasText: 'lower'}).fill(dateCondition);
        await this.page.getByRole('option', { name: dateCondition }).waitFor({ state: 'visible' });
        await this.page.getByRole('option', { name: dateCondition }).click();
        // await this.page.getByTestId('select-option', { hasText: dateCondition, exact: true }).waitFor({ state: 'visible' });
        // await this.page.getByTestId('select-option', { hasText: dateCondition, exact: true }).click();

        await this.page.locator(`[data-test-id="${filterValueInput}"]`).fill(dateValue);
        await this.selectors.saveFiltersButton.click();
        await this.page.locator('table[role="grid"] tbody tr').first().waitFor({ state: 'attached' });
    }

    async populateFilter(filterKeyInput, filterValueInput, filterType, filterValue, callerFn) {
        const inputValues = ['Order Number', 'Customer Email', 'Creation date'];
        if (callerFn !== 'switchFilterOnOrders') {
            await this.selectors.addFilterButton.click();
        }
        await this.selectors.whereClause.waitFor({ state: 'visible' });
        await this.page.locator(`[data-test-id="${filterKeyInput}"]`).fill(filterType);
        await this.page.getByTestId('select-option', { hasText: filterType }).waitFor({ state: 'visible' });
        await this.page.getByTestId('select-option', { hasText: filterType }).click();
        // console.log(filterValueInput);
        if (inputValues.includes(filterType)) {
            await this.page.locator(`[data-test-id="${filterValueInput}"]`).fill(filterValue)
        }
        else {
            await this.page.locator(`[data-test-id="${filterValueInput}"]`).click();
            await this.page.getByRole('option', { name: filterValue }).waitFor({ state: 'visible' });
            await this.page.getByRole('option', { name: filterValue }).click();
        }

        await this.selectors.saveFiltersButton.click();
        await this.page.locator('table[role="grid"] tbody tr').first().waitFor({ state: 'attached' });

        // if (filterType !== 'Creation date') {

        // }
    }

    async switchToDateFilter(dateType, dateCondition, dateValue) {
        await this.selectors.filterButton.click();
        await this.selectors.addFilterButton.waitFor({ state: 'visible' });
        const isWhereVisible = await this.selectors.whereClause.isVisible();
        // console.log(`Where for filter ${filterType} is visible?: ${isWhereVisible}`);
        if (isWhereVisible) {
            await this.populateDateFilter('left-0', 'right-0', dateType, dateCondition, dateValue)
        }
    }

    async switchFilterOnOrders(filterType, filterValue) {
        // await this.selectors.searchInput.waitFor({ state: 'visible' });
        await this.selectors.filterButton.click();
        await this.selectors.addFilterButton.waitFor({ state: 'visible' });
        // const isWhereVisible = await this.selectors.whereClause.isVisible();
        try {
            await this.selectors.whereClause.waitFor({ state: 'visible', timeout: 5000 });
            await this.populateFilter('left-0', 'right-0', filterType, filterValue, 'switchFilterOnOrders')
        }
        catch {

        }
        // console.log(`Where for filter ${filterType} is visible?: ${isWhereVisible}`);
        // if (isWhereVisible) {
        //     await this.populateFilter('left-0', 'right-0', filterType, filterValue, 'switchFilterOnOrders')
        // }
    }


    async addFilterOnOrders(filterType, filterValue) {
        await this.selectors.searchInput.waitFor({ state: 'visible' });
        await this.selectors.filterButton.click();
        await this.selectors.addFilterButton.waitFor({ state: 'visible' });
        const isWhereVisible = await this.selectors.whereClause.isVisible();
        console.log(`Where for filter ${filterType} is visible?: ${isWhereVisible}`);
        if (!isWhereVisible) {
            await this.populateFilter('left-0', 'right-0', filterType, filterValue, 'addFilterOnOrders')
        }
        else {
            await this.populateFilter('left-2', 'right-2', filterType, filterValue, 'addFilterOnOrders')
        }
    }

    async partialFulfillOrder(lineItems) {
        let isSelectEnabled;
        try {
            await this.selectors.fulfillButton.waitFor({ state: 'visible', timeout: 5000 });
        } catch (err) {
            throw new Error('Order cannot be fulfilled or is already fulfilled');
        }
        await this.selectors.fulfillButton.click();
        await this.page.locator('span', { hasText: 'Items ready to ship' }).waitFor({ state: 'visible' });
        const fulfillmentRows = await this.page.locator('table', { has: this.page.locator('thead > tr', { hasText: 'Product name' }) }).locator('tbody > tr')
        await fulfillmentRows.first().waitFor({ state: 'visible' });
        const lineItemsCount = await fulfillmentRows.count();
        console.log('Fulfillment row count is: ', lineItemsCount);
        // assume `lineItems` is an array of strings, e.g. ['Item A', 'Item B']
        const expectedLower = lineItems.map(s => s.toLowerCase());

        for (let i = 0; i < lineItemsCount; i++) {
            const lineItemTitle = await fulfillmentRows.nth(i).locator('td').first().innerText();
            const trimmedText = lineItemTitle.trim().toLowerCase();

            const matchIndex = expectedLower.findIndex(expected => trimmedText.includes(expected));
            if (matchIndex !== -1) {
                // click the matched row's select button
                await fulfillmentRows.nth(i).getByTestId('select-warehouse-button').click();

                // wait for dialog and click Select if enabled
                await this.page.locator('[role="dialog"]').waitFor({ state: 'visible' });
                await this.selectors.warehouseList.waitFor({ state: 'visible' });
                await this.page.locator('td', { hasText: 'Asia' }).click();
                const isSelectEnabled = await this.page.getByRole('button', { name: 'Select' }).isEnabled();
                if (isSelectEnabled) {
                    await this.page.getByRole('button', { name: 'Select' }).click();
                    try {
                        await this.page.locator('[role="dialog"]').waitFor({ state: 'hidden', timeout: 5000 });
                    } catch (e) {
                        // ignore timeout hiding dialog
                    }


                    // remove the matched expected so we don't match it again
                    expectedLower.splice(matchIndex, 1);

                    // stop early if we've matched all expected items
                    if (expectedLower.length === 0) break;
                }
            }
        }

        await fulfillmentRows.last().locator('td').nth(2).locator('input').fill('0');
        // Commenting our below lines as warehouse dropdown is disabled if quantity is zero
        // await fulfillmentRows.last().getByTestId('select-warehouse-button').click();

        // // wait for dialog and click Select if enabled
        // await this.page.locator('[role="dialog"]').waitFor({ state: 'visible' });
        // await this.page.locator('td', { hasText: 'Africa' }).locator('input').click();
        // isSelectEnabled = await this.page.getByRole('button', { name: 'Select' }).isEnabled();
        // if (isSelectEnabled) {
        //     await this.page.getByRole('button', { name: 'Select' }).click();
        //     try {
        //         await this.page.locator('[role="dialog"]').waitFor({ state: 'hidden', timeout: 5000 });
        //     } catch (e) {
        //         // ignore timeout hiding dialog
        //     }
        // }
        await expect(this.selectors.confirmButton).toBeEnabled();


        await this.selectors.confirmButton.click();
        await this.selectors.orderSummary.waitFor({ state: 'visible' });
        // await this.selectors.unfulfilledOrderLinesSection.waitFor({ state: 'visible'});
        const isPartialFulfilled = await await this.page.locator('[data-test-id="status-info"]').getByText('Partially fulfilled').isVisible();
        if (isPartialFulfilled) return true;
        else return false;
    }

    async fulfillOrder(lineItems) {
        try {
            await this.selectors.fulfillButton.waitFor({ state: 'visible', timeout: 5000 });
        } catch (err) {
            throw new Error('Order cannot be fulfilled or is already fulfilled');
        }
        await this.selectors.fulfillButton.click();
        await this.page.locator('span', { hasText: 'ready to ship' }).waitFor({ state: 'visible' });
        const fulfillmentRows = await this.page.locator('table', { has: this.page.locator('thead > tr', { hasText: 'Product name' }) }).locator('tbody > tr')
        await fulfillmentRows.first().waitFor({ state: 'visible' });
        const lineItemsCount = await fulfillmentRows.count();
        console.log('Fulfillment row count is: ', lineItemsCount);
        // assume `lineItems` is an array of strings, e.g. ['Item A', 'Item B']
        const expectedLower = lineItems.map(s => s.toLowerCase());

        for (let i = 0; i < lineItemsCount; i++) {
            const lineItemTitle = await fulfillmentRows.nth(i).locator('td').first().innerText();
            const trimmedText = lineItemTitle.trim().toLowerCase();

            const matchIndex = expectedLower.findIndex(expected => trimmedText.includes(expected));
            if (matchIndex !== -1) {
                // click the matched row's select button
                await fulfillmentRows.nth(i).getByTestId('select-warehouse-button').click();

                // wait for dialog and click Select if enabled
                await this.page.locator('[role="dialog"]').waitFor({ state: 'visible' });
                await this.selectors.warehouseList.waitFor({ state: 'visible' });
                await this.page.locator('td', { hasText: 'Asia' }).click();
                const isSelectEnabled = await this.page.getByRole('button', { name: 'Select' }).isEnabled();
                if (isSelectEnabled) {
                    await this.page.getByRole('button', { name: 'Select' }).click();
                    try {
                        await this.page.locator('[role="dialog"]').waitFor({ state: 'hidden', timeout: 5000 });
                    } catch (e) {
                        // ignore timeout hiding dialog
                    }


                    // remove the matched expected so we don't match it again
                    expectedLower.splice(matchIndex, 1);

                    // stop early if we've matched all expected items
                    if (expectedLower.length === 0) break;
                }
            }
        }

        await expect(this.selectors.confirmButton).toBeEnabled();
        await this.selectors.confirmButton.click();
        await this.selectors.orderSummary.waitFor({ state: 'visible' });
        // await this.page.pause();
        // const isFulfilledVisible = await this.selectors.fulfilledOrderSection.first().isVisible();
        const isFulfilledVisible = await this.page.locator('[data-test-id="status-info"]').getByText('Fulfilled').isVisible();
        if (isFulfilledVisible) return true;
        else return false;
    }

    async fetchAdditionalOrderDetails() {
        let additionalDetails = [];
        const subTotal = await this.selectors.subTotal.innerText();
        const orderTotal = await this.selectors.orderTotal.innerText();
        const shippingCost = await this.selectors.shippingCost.innerText();
        const taxAmount = await this.selectors.taxAmount.innerText();
        const paymentStatusInfo = await this.selectors.chargeStatus.innerText();
        const customerEmail = await this.selectors.customerEmail.innerText();
        const totalCaptured = await this.selectors.totalCaptured.innerText();
        const outstandingAmount = await this.selectors.outstandingBalance.innerText();

        additionalDetails.push({
            subTotal: subTotal,
            orderTotal: orderTotal,
            shippingCost: shippingCost,
            taxAmount: taxAmount,
            paymentStatusInfo: paymentStatusInfo,
            customerEmail: customerEmail,
            totalCaptured: totalCaptured,
            outstandingBalance: outstandingAmount
        })

        return additionalDetails;
    }

    async scrollColumnIntoView(colIndex) {
        const scroller = this.page.locator('.dvn-scroller').first();
        const cellExists = () =>
            this.page.locator(`table[role="grid"] tbody tr[role="row"]`).first()
                .locator(`td[aria-colindex="${colIndex}"]`).count();

        for (let i = 0; i < 30; i++) {
            if (await cellExists() > 0) return;
            await scroller.evaluate(el => { el.scrollLeft += 100; });
            await this.page.waitForTimeout(100);
        }
        throw new Error(`Column ${colIndex} never appeared after scrolling`);
    }

    async getFullColumnHeaderMap() {
        await this.scrollGridToLeftEdge();
        const leftHeaders = await this.getColumnHeaderMap();

        await this.scrollGridToRightEdge();
        const rightHeaders = await this.getColumnHeaderMap();

        let merged = { ...leftHeaders, ...rightHeaders };

        // getColumnHeaderMap already retries unstable cells once internally, but
        // that can't help if the SAME column is unstable at both scroll positions.
        // Check for gaps in the expected 1..maxIndex sequence and retry once more
        // before accepting a genuinely missing column.
        const indices = Object.keys(merged).map(Number);
        const maxIndex = indices.length ? Math.max(...indices) : 0;
        const missing = [];
        for (let i = 1; i <= maxIndex; i++) {
            if (!merged[i]) missing.push(i);
        }

        if (missing.length) {
            console.warn(`getFullColumnHeaderMap: missing column(s) ${missing.join(', ')} after left+right scroll — retrying once`);
            await this.scrollGridToLeftEdge();
            merged = { ...merged, ...(await this.getColumnHeaderMap()) };
            await this.scrollGridToRightEdge();
            merged = { ...merged, ...(await this.getColumnHeaderMap()) };

            const stillMissing = [];
            for (let i = 1; i <= maxIndex; i++) {
                if (!merged[i]) stillMissing.push(i);
            }
            if (stillMissing.length) {
                console.warn(`getFullColumnHeaderMap: column(s) ${stillMissing.join(', ')} never stabilized — downstream consumers must handle missing keys`);
            }
        }

        await this.scrollGridToLeftEdge();
        return merged;
    }

    async getColumnHeaderMap() {
        const headerCells = this.page.locator('table[role="grid"] thead [role="columnheader"]');
        await headerCells.first().waitFor({ state: 'attached' });
        const count = await headerCells.count();

        const map = {};
        for (let i = 0; i < count; i++) {
            const cell = headerCells.nth(i);
            try {
                // Same virtualization risk as captureVisibleColumns — a header cell
                // can detach/re-render mid-loop, so give each one its own short,
                // bounded wait instead of one shared 30s test timeout.
                await cell.waitFor({ state: 'attached', timeout: 5000 });
                const colIndex = await cell.getAttribute('aria-colindex');
                const text = (await cell.innerText()).trim();
                if (colIndex && text) map[colIndex] = text;
            } catch (err) {
                console.warn(`getColumnHeaderMap: header cell ${i} did not stabilize — skipping. ${err.message}`);
            }
        }
        return map;
    }

    async captureVisibleColumns(rowsLocator) {
        const count = await rowsLocator.count();
        const captured = [];

        for (let i = 0; i < count; i++) {
            const row = rowsLocator.nth(i);
            const cells = row.locator('td[aria-colindex]');
            const cellCount = await cells.count();
            const rowData = captured[i] || {};

            for (let c = 0; c < cellCount; c++) {
                const cell = cells.nth(c);
                try {
                    // Virtualized cells can detach/re-render mid-read (e.g. a product
                    // thumbnail still loading and being retried by the dashboard's own
                    // backoff logic). Wait for THIS cell specifically to be attached,
                    // with a short timeout, so one unstable cell can't consume the
                    // whole test's 30s budget.
                    await cell.waitFor({ state: 'attached', timeout: 2000 });
                    const colIndex = await cell.getAttribute('aria-colindex');
                    const colText = (await cell.innerText()).trim();
                    rowData[colIndex] = colText;
                } catch (err) {
                    console.warn(`captureVisibleColumns: row ${i}, cell ${c} (colIndex unknown) did not stabilize — skipping. ${err.message}`);
                }
            }
            captured[i] = rowData;
        }
        return captured;
    }

    async fetchOrderLineItems() {
        console.log('dvn-scroller count:', await this.page.locator('.dvn-scroller').count());
        const headerMap = await this.getFullColumnHeaderMap(); // was: await this.getColumnHeaderMap()
        const rowsLocator = this.page.locator('table[role="grid"] tbody tr[role="row"]');

        await this.scrollGridToLeftEdge();
        const leftCapture = await this.captureVisibleColumns(rowsLocator);

        await this.scrollGridToRightEdge();
        const rightCapture = await this.captureVisibleColumns(rowsLocator);

        const rowCount = Math.max(leftCapture.length, rightCapture.length);
        const merged = [];
        for (let i = 0; i < rowCount; i++) {
            merged.push({ ...(leftCapture[i] || {}), ...(rightCapture[i] || {}) });
        }

        // ... existing fallback loop for any still-missing body columns, unchanged ...

        await this.scrollGridToLeftEdge();

        return merged.map(row => {
            const named = {};
            for (const [colIndex, value] of Object.entries(row)) {
                if (colIndex === '1') continue; // thumbnail column, no header text, safe to drop
                named[headerMap[colIndex] || colIndex] = value;
            }
            return named;
        });

    }

    async navigateToOrderByNumber(orderNumber) {
        const row = await query('SELECT id FROM order_order WHERE number = $1', [orderNumber]);
        if (!row.length) throw new Error(`No order found with number ${orderNumber}`);

        const encodedId = Buffer.from(`Order:${row[0].id}`).toString('base64');
        await this.page.goto(`orders/${encodedId}`);
        await this.selectors.orderSummary.waitFor({ state: 'visible' });
    }

    isoToMs(isoLike) {
        // if isoLike contains 'T' and no timezone, Date.parse will treat it as local in many engines
        const parsed = Date.parse(isoLike);
        if (!Number.isNaN(parsed)) return parsed;
        // fallback: split and build
        const [datePart, timePart] = isoLike.split('T');
        const [y, m, d] = datePart.split('-').map(Number);
        const [hh, mm] = (timePart || '00:00').split(':').map(Number);
        return new Date(y, m - 1, d, hh, mm).getTime();
    }

    // helper: parse "Thursday, August 6, 2026, 3:38 PM" -> ms since epoch (local time)
    parseVisibleDateToMs(visible) {
        // remove weekday and trim
        // "Thursday, August 6, 2026, 3:38 PM" -> "August 6, 2026, 3:38 PM"
        const withoutWeekday = visible.replace(/^[^,]+,\s*/, '').trim();

        // Use Date.parse fallback if it works in your environment
        const parsed = Date.parse(withoutWeekday);
        if (!Number.isNaN(parsed)) return parsed;

        // Fallback manual parse: Month name, day, year, time, AM/PM
        const m = withoutWeekday.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4}),\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (!m) throw new Error('Unrecognized date format: ' + visible);

        const [, monthName, dayStr, yearStr, hourStr, minuteStr, ampm] = m;
        const month = new Date(`${monthName} 1, 2000`).getMonth(); // convert month name to 0-based month
        let hour = Number(hourStr);
        const minute = Number(minuteStr);
        if (/^PM$/i.test(ampm) && hour !== 12) hour += 12;
        if (/^AM$/i.test(ampm) && hour === 12) hour = 0;

        const year = Number(yearStr);
        const day = Number(dayStr);

        // construct local Date
        return new Date(year, month, day, hour, minute).getTime();
    }



    toEpochMs(input) {
        if (!input) throw new Error('Missing date input');
        let s = String(input).trim();

        // Replace space between date and time with T
        s = s.replace(/^(\d{4}-\d{2}-\d{2})\s+/, '$1T');

        // Normalize timezone +00 or +00:00 to Z
        s = s.replace(/(\+00:?00?)$|(\+00:00$)/, 'Z');

        // If timezone is like +05:30 keep it; otherwise ensure trailing Z if none
        if (!/[Z+\-]\d{2}(:?\d{2})?$/.test(s)) s = s + 'Z';

        // Truncate fractional seconds to 3 digits (ms)
        s = s.replace(/(\.\d{3})\d*(Z|[+\-]\d{2}(:?\d{2})?)$/, '$1$2');
        // If no fractional part, add .000
        s = s.replace(/(T\d{2}:\d{2}:\d{2})(Z|[+\-])/, '$1.000$2');

        const ms = Date.parse(s);
        if (Number.isNaN(ms)) throw new Error('Invalid date: ' + input);
        return ms;
    }


    // async scrollGridToLeftEdge() {
    //     const scroller = this.page.locator('.dvn-scroller').first();
    //     await scroller.evaluate(el => { el.scrollLeft = 0; });
    //     await this.page.waitForTimeout(150); // let virtualization settle
    // }

    // async scrollGridToRightEdge() {
    //     const scroller = this.page.locator('.dvn-scroller').first();
    //     await scroller.evaluate(el => { el.scrollLeft = el.scrollWidth - el.clientWidth; });
    //     await this.page.waitForTimeout(150);
    // }

    async scrollGridToLeftEdge() {
        const scroller = this.page.locator('.dvn-scroller').first();
        await scroller.evaluate(el => { el.scrollLeft = 0; });
        await this.waitForScrollSettle(scroller);
    }

    async scrollGridToRightEdge() {
        const scroller = this.page.locator('.dvn-scroller').first();
        await scroller.evaluate(el => { el.scrollLeft = el.scrollWidth - el.clientWidth; });
        await this.waitForScrollSettle(scroller);
    }

    async waitForScrollSettle(scroller, { checks = 3, interval = 100, timeout = 5000 } = {}) {
        const start = Date.now();
        let lastValue = await scroller.evaluate(el => el.scrollLeft);
        let stableCount = 0;
        while (Date.now() - start < timeout) {
            await this.page.waitForTimeout(interval);
            const current = await scroller.evaluate(el => el.scrollLeft);
            if (current === lastValue) {
                stableCount++;
                if (stableCount >= checks) return; // unchanged across `checks` consecutive reads — settled
            } else {
                stableCount = 0;
                lastValue = current;
            }
        }
        console.warn('waitForScrollSettle: scrollLeft never stabilized within timeout — proceeding anyway');
    }

    async fetchAllOrders() {
        // await this.dismissAnnouncement();
        const allOrders = [];
        const COL = {
            orderNumber: 2, orderDate: 3, customer: 4, paymentStatus: 5,
            fulfillmentStatus: 6, orderNet: 7, orderTotal: 8, orderChannel: 9,
        };
        // await this.dismissPulseAnnouncementIfPresent();

        const readColumns = async (colEntries) => {
            console.log('entered');
            const rows = this.page.locator('tbody[role="rowgroup"] tr[role="row"]');
            const count = await rows.count();
            console.log('rows count is: ', count);
            const out = [];
            for (let i = 0; i < count; i++) {
                const row = rows.nth(i);
                const data = {};
                for (const [key, colIndex] of colEntries) {
                    const cell = row.locator(`td[aria-colindex="${colIndex}"]`);
                    const cellText = await cell.innerText();
                    // console.log('Column text is: ', cellText);
                    data[key] = (await cell.count()) > 0 ? cellText.trim() : null;
                }
                out.push(data);
            }
            return out;
        };

        while (true) {
            await this.page.locator('table[role="grid"] tbody tr').first().waitFor({ state: 'attached' });

            const rows = this.page.locator('tbody[role="rowgroup"] tr[role="row"]');
            const count = await rows.count();
            // console.log('Order count is: ', count);

            await this.scrollGridToLeftEdge();
            const orderNumberBeforeNav = count > 0
                ? (await rows.nth(0).locator(`td[aria-colindex="${COL.orderNumber}"]`).innerText()).trim()
                : null;

            const leftData = await readColumns([
                ['orderNumber', COL.orderNumber], ['orderDate', COL.orderDate],
                ['customer', COL.customer], ['paymentStatus', COL.paymentStatus],
                ['fulfillmentStatus', COL.fulfillmentStatus],
            ]);

            await this.scrollGridToRightEdge();
            const rightData = await readColumns([
                ['orderNet', COL.orderNet], ['orderTotal', COL.orderTotal], ['orderChannel', COL.orderChannel],
            ]);

            for (let i = 0; i < count; i++) allOrders.push({ ...leftData[i], ...rightData[i] });

            await this.scrollGridToLeftEdge();

            if (await this.selectors.nextPage.isDisabled()) break;
            await this.selectors.nextPage.click();

            await this.page.waitForFunction(
                ({ prev, colIndex }) => {
                    const cell = document.querySelector(`td[aria-colindex="${colIndex}"]`);
                    return cell && cell.textContent.trim() !== prev;
                },
                { prev: orderNumberBeforeNav, colIndex: COL.orderNumber },
                { timeout: 10000 }
            );
        }

        return allOrders;
    }
}
module.exports = OrderPage;