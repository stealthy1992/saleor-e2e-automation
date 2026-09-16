const { test: customerTest, expect } = require('../../fixtures/customer');
const { test, request: pwRequest } = require('@playwright/test');
const CustomerPage = require('../../page-objects/CustomerPage');
const { query } = require('../../utils/db-client');
const { graphqlRequest } = require('../../utils/graphql-client');

// Shared by Section C and D's tokenCreate checks.
async function assertTokenCreateRejected(email, password) {
    const ctx = await pwRequest.newContext({ baseURL: process.env.SALEOR_API_URL });
    const { data } = await graphqlRequest(ctx, `
        mutation TokenCreate($email: String!, $password: String!) {
            tokenCreate(email: $email, password: $password) {
                token
                errors { field message code }
            }
        }
    `, { email, password });
    expect(data.tokenCreate.token).toBeNull();
    expect(data.tokenCreate.errors.length).toBeGreaterThan(0);
    await ctx.dispose();
}

customerTest.describe.serial('4.5 Customer Management UI', () => {

    customerTest.describe('A. List & Locate (P0)', async () => {
        let customerPage;

        customerTest.beforeEach(async ({ page }) => {
            customerPage = new CustomerPage(page);
        });

        customerTest('CUST-UI-001 should list the fixture-seeded testCustomer in the Customers page', async ({ page, testCustomer }) => {
            await page.goto('customers');
            const customersOnUI = await customerPage.fetchAllCustomers();
            const found = customersOnUI.find(c => c.email === testCustomer.email);
            expect(found).toBeTruthy();

            const dbRow = await query('SELECT email, first_name, last_name FROM account_user WHERE email = $1', [testCustomer.email]);
            expect(dbRow[0].email).toBe(testCustomer.email);
            expect(dbRow[0].first_name).toBe(testCustomer.firstName);
        });

        test('CUST-UI-002 should search customers by email', async ({ page }) => {
            const dbRow = (await query("SELECT email FROM account_user WHERE is_staff = false LIMIT 1"))[0];
            await page.goto('customers');
            const results = await customerPage.searchCustomer(dbRow.email);
            expect(results.some(c => c.email === dbRow.email)).toBeTruthy();
        });

        test('CUST-UI-003 should search customers by name', async ({ page }) => {
            const dbRow = (await query("SELECT first_name FROM account_user WHERE is_staff = false LIMIT 1"))[0];
            await page.goto('customers');
            const results = await customerPage.searchCustomer(dbRow.first_name);
            for (const r of results) expect(r.name).toContain(dbRow.first_name);
        });
    })

    customerTest.describe('B. Customer Detail View (P0)', () => {

        let customerPage;
        const customerEmail = 'garrett.cunningham@example.com';
        test.beforeEach(async ({ page }) => {
            customerPage = new CustomerPage(page);
        });

        test('This will verify customer personal and order details against DB', async ({ page }) => {

            await test.step('CUST-UI-004 should display correct customer details matching account_user', async () => {

                const dbRow = await query("SELECT first_name, last_name FROM account_user WHERE is_staff = false AND email = $1 LIMIT 1", [customerEmail]);
                console.log(dbRow[0]);
                await page.goto('customers');
                await customerPage.navigateToCustomer(customerEmail); // or by name, whichever your nav method uses
                const { firstName, lastName, email } = await customerPage.fetchCustomerDetails();
                expect(firstName.trim()).toBe(dbRow[0].first_name);
                expect(lastName.trim()).toBe(dbRow[0].last_name);
                expect(email.trim()).toBe(customerEmail);
            });

            await test.step('**CUST-UI-005** `should display the customers order history, if any`', async () => {
                const orderList = await customerPage.fetchCustomerOrders();
                console.log('UI order list is: ', orderList);
                const dbOrders = await query('SELECT total_net_amount, number, status, currency, created_at FROM order_order WHERE user_email = $1', [customerEmail]);
                console.log(dbOrders);
                const uiNormalized = orderList.map(customerPage.normalizeUIOrder).sort((a, b) => a.number - b.number);
                const dbNormalized = dbOrders.map(customerPage.normalizeDBOrder).sort((a, b) => a.number - b.number);
                expect(uiNormalized).toEqual(dbNormalized);
            })

            await test.step('**CUST-UI-006** `should display the customers saved addresses, if any`', async () => {
                const { name, streetAddress1, postalCode, city, countryArea, country } = await customerPage.fetchAddress();
                const dbRow = (await query(
                    `SELECT au.default_billing_address_id, au.default_shipping_address_id
                    FROM account_user au WHERE au.email = $1`,
                    [customerEmail]
                ))[0];
                const defaultAddress = (await query(
                    'SELECT * FROM account_address WHERE id = $1',
                    [dbRow.default_shipping_address_id] // or default_billing_address_id, depending which section you're asserting
                ))[0];
                // console.log('UI address is: ',uiAddress);
                console.log('DB address is: ', defaultAddress);
                expect(name).toBe(`${defaultAddress.first_name} ${defaultAddress.last_name}`);
                expect(streetAddress1).toBe(defaultAddress.street_address_1);

                expect(city).toBe(defaultAddress.city);
                expect(countryArea).toBe(defaultAddress.country_area);
                expect(postalCode).toBe(defaultAddress.postal_code);


            })
        })
    })

    customerTest.describe('C. Customer Edit (Staff-Side) (P0)', () => {
        let customerPage;
        let updatedInfo;
        const updatedName = {
            firstName: 'Mitchel',
            lastName: 'Johnson'
        }
        customerTest.beforeEach(async ({ page }) => {
            customerPage = new CustomerPage(page);
        });
        
        customerTest('This will test staff ability to edit customer details', async ({ page, mutableCustomer }) => {
            
            await test.step('**CUST-UI-007** `should update a customers name via the UI`', async () => {
                await page.goto('customers');
                console.log(typeof mutableCustomer, Array.isArray(mutableCustomer));
                await customerPage.navigateToCustomer(mutableCustomer.email);
                updatedInfo = await customerPage.updateCustomerInfo(updatedName);
                expect(updatedInfo.firstName.trim()).toBe(updatedName.firstName);
                expect(updatedInfo.lastName.trim()).toBe(updatedName.lastName);

            })

            await test.step('**CUST-UI-008** `should reflect the edit in account_user immediately`', async () => {
                const dbRow = (await query('SELECT first_name, last_name FROM account_user WHERE email = $1', [mutableCustomer.email]))[0];
                console.log('DB retrieved result is: ',dbRow);
                expect(dbRow.first_name).toBe(updatedInfo.firstName.trim());
                expect(dbRow.last_name).toBe(updatedInfo.lastName.trim());
            })

            await test.step('**CUST-UI-009** `should deactivate a customer account via the UI`', async () => {
                const status = await customerPage.deactivateCustomer();
                expect(status).toBe('Inactive')
            })

            await test.step('**CUST-UI-009b** `should reject tokenCreate for a deactivated customer`', async () => {
                await assertTokenCreateRejected(mutableCustomer.email, mutableCustomer.password);
            })

            await test.step('**CUST-UI-010** `should reactivate a previously deactivated customer account`', async () => {
                const updatedStatus = await customerPage.activateCustomer();
                expect(updatedStatus).toBe('Active');
            })
        })

    })

    customerTest.describe('D. Customer Deletion (Staff-Side) (P0)', () => {
        let customerPage;
        customerTest.beforeEach(async ({ page }) => {
            customerPage = new CustomerPage(page);
        });

        customerTest('This will test staff ability to delete a customer', async ({ page, mutableCustomer }) => {

            await test.step('**CUST-UI-011** `should delete a customer via the UI`', async () => {

                await page.goto('customers');
                await customerPage.navigateToCustomer(mutableCustomer.email);
                const isWarningDisplayed = await customerPage.attemptCustomerDeletion();
                expect(isWarningDisplayed).toBe(true);

            })

            await test.step('**CUST-UI-012** `should require confirmation before deleting a customer`', async () => {
                const isDeleted = await customerPage.deleteCustomer();
                expect(isDeleted).toBe(true);
            })

            await test.step('**CUST-UI-013** `should actually delete the row from account_user, not soft-delete`', async () => {
                const dbRow = await query('SELECT * FROM account_user WHERE email = $1', [mutableCustomer.email]);
                expect(dbRow).toEqual([]);
            })

            await test.step('**CUST-UI-013b** `should reject tokenCreate for a deleted customer`', async () => {
                await assertTokenCreateRejected(mutableCustomer.email, mutableCustomer.password);
            })
        })
    })

    customerTest.describe('E. Validation (P1)', () => {

        let customerPage;
        customerTest.beforeEach(async ({ page }) => {
            customerPage = new CustomerPage(page);
        });

        customerTest('This will verify email validation checks are in place', async ({ page, mutableCustomer, testCustomer }) => {

            await test.step('**CUST-UI-014** `should show a validation error when saving an invalid email format`', async () => {
                await page.goto('customers');
                await customerPage.navigateToCustomer(mutableCustomer.email);
                const isValidationErrorVisible = await customerPage.editEmail('not-an-email');
                expect(isValidationErrorVisible).toBe(true);
            })

            await test.step('**CUST-UI-015** `should show a specific error when saving a duplicate email`', async () => {
                // testCustomer is worker-scoped and read-only elsewhere — safe
                // to use its email as a guaranteed-to-exist duplicate target.
                const isDuplicateWarningVisible = await customerPage.editEmail(testCustomer.email);
                expect(isDuplicateWarningVisible).toBe(true);
            })

        })

    })

    customerTest.describe('F. RBAC (P1)', () => {


        test('**CUST-UI-016** `should hide or restrict Customer management for the limited-access (MANAGE_PRODUCTS-only) staff`', async ({ page }) => {
            let customerPage;
            const limitedUser = {
                email: "limited-staff-standing@tester.com",
                password: "12345678"
            }
            customerPage = new CustomerPage(page);
            await page.goto('dashboard');
            await customerPage.dismissAnnouncement();
            await customerPage.logout();
            await customerPage.login(limitedUser.email, limitedUser.password);
            await page.goto('customers');
            await customerPage.pageRestrictedWith404();
        })
    })
});