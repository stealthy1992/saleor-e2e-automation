require('dotenv').config();

const base = require('@playwright/test');
const { request: pwRequest } = require('@playwright/test');
const { test: staffTest } = require('../../fixtures/staff');
const LoginPage = require('../../page-objects/LoginPage');
const { graphqlRequest } = require('../../utils/graphql-client');

const test = base.test.extend({
    page: async ({ browser }, use) => {
        const context = await browser.newContext({ storageState: undefined });
        const page = await context.newPage();
        await use(page);
        await context.close();
    },
});
const { expect } = base;

test.describe.serial('This will test the entire login module', () => {
    let loginPage;
    const apiUrl = process.env.SALEOR_API_URL + '/graphql/';
    const admin = {
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD
    }

    test.beforeEach(async ({ page }) => {
        loginPage = new LoginPage(page);
        await page.goto('/dashboard');
    })

    test('A. Happy Path', async () => {
        await test.step('LOGIN-001 should log in successfully with valid staff credentials', async () => {
            const isLoggedIn = await loginPage.login(admin.email, admin.password);
            expect(isLoggedIn).toBe(true);
        })

        await test.step('LOGIN-002 should redirect to the dashboard home page after successful login', async () => {
            await loginPage.loginConfirmed();
        })

        await test.step('LOGIN-003 should display the logged-in user email in the account menu', async () => {
            const visibleEmail = await loginPage.visibleEmailCheck();
            expect(visibleEmail).toBe(admin.email);
        })

        await test.step('LOGIN-004 should log user out after the logout button click', async () => {
            await loginPage.logout();
        })
    })

    test('B. Field Validation (client-side, before any request fires)', async ({ page }) => {
        await test.step('LOGIN-004 should show a validation error when email is empty', async () => {
            const isErrorVisible = await loginPage.loginWithoutEmail(admin.password);
            expect(isErrorVisible).toBe(true);
        })

        await test.step('LOGIN-005 should show a validation error when password is empty', async () => {
            const isErrorVisible = await loginPage.loginWithoutPassword(admin.email);
            expect(isErrorVisible).toBe(true);
        })

        await test.step('LOGIN-006 should show a validation error when both fields are empty', async () => {
            const isErrorVisible = await loginPage.emptyLogin();
            expect(isErrorVisible).toBe(true);
        })

        await test.step('LOGIN-007 should show a validation error for a malformed email (no @, no domain)', async () => {
            const errorMessage = await loginPage.malformedLoginAttempt('someemail', '12345');
            await loginPage.assertLoginError('invalidCredentials');
        })

        await test.step('LOGIN-008 should not fire a login request when client-side validation fails', async () => {
            let tokenCreateWasCalled = false;

            await page.route('**/graphql/', async (route) => {
                const request = route.request();
                const postData = request.postDataJSON();

                if (postData?.query?.includes('tokenCreate')) {
                    tokenCreateWasCalled = true;
                }

                await route.continue();
            });

            const isErrorVisible = await loginPage.emptyLogin();
            expect(isErrorVisible).toBe(true);
            await page.waitForTimeout(500);
            expect(tokenCreateWasCalled).toBe(false);
            await page.unroute('**/graphql/');
        })
    })

    test('C. Negative Credentials (server-side rejection)', async ({ page }) => {

        await test.step('LOGIN-009 should show an error for a valid email with wrong password', async () => {
            let tokenCreateMutationCalled = false;

            await page.route('**/graphql/', async (route) => {
                const request = route.request();
                const postData = request.postDataJSON();

                if (postData?.query?.includes('tokenCreate')) {
                    tokenCreateMutationCalled = true;
                }

                await route.continue();
            })

            await loginPage.malformedLoginAttempt(admin.email, '12345');
            await loginPage.assertLoginError('invalidCredentials');
            expect(tokenCreateMutationCalled).toBe(true);
            await page.unroute('**/graphql/');
        })

        await test.step('LOGIN-010 should show an error for a non-existent email & rate-limit error message should display', async () => {
            let tokenCreateMutationCalled = false;

            await page.route('**/graphql/', async (route) => {
                const request = route.request();
                const postData = request.postDataJSON();

                if (postData?.query?.includes('tokenCreate')) {
                    tokenCreateMutationCalled = true;
                }

                await route.continue();
            })

            const errorMessage = await loginPage.malformedLoginAttempt('admin@solception.com', '12345678');
            await loginPage.assertLoginError('invalidCredentials');
            expect(tokenCreateMutationCalled).toBe(true);
            await page.unroute('**/graphql/');
        })

        await test.step('LOGIN-011 should not reveal whether the email exists in the error message', async () => {
            const errorMessage = await loginPage.malformedLoginAttempt('blah@tester.com', '12345');
            expect(errorMessage).not.toMatch(/email|does|not|exist/);
        })

        await test.step('LOGIN-012 should treat email as case-insensitive', async () => {
            let tokenCreateMutationCalled = false;
            await page.route('**/graphql/', async (route) => {
                const request = route.request();
                const postData = request.postDataJSON();

                if (postData?.query?.includes('tokenCreate')) {
                    tokenCreateMutationCalled = true;
                }

                await route.continue();
            })

            const isLoggedIn = await loginPage.login(admin.email.toUpperCase(), admin.password);
            expect(isLoggedIn).toBe(true);
            await page.unroute('**/graphql/');
        })
    })

    test('LOGIN-013 should display a rate-limit message after rapid repeated login attempts', async ({ page }) => {
        test.setTimeout(180000);
        let lastApiErrors = null;
        let waitMs = 500;

        await page.route('**/graphql/', async (route) => {
            const request = route.request();
            const postData = request.postDataJSON();
            const response = await route.fetch();
            const responseBody = await response.json();

            if (postData?.query?.includes('tokenCreate')) {
                lastApiErrors = responseBody.data?.tokenCreate?.errors ?? [];
            }

            await route.fulfill({ response });
        });

        for (let i = 0; i < 5; i++) {
            const messageText = await loginPage.malformedLoginAttempt('someemail', '12345');

            if (lastApiErrors?.[0]) {
                loginPage.assertErrorPairFromData(lastApiErrors[0], messageText);
            }

            const delayError = lastApiErrors?.find(e => e.code === 'LOGIN_ATTEMPT_DELAYED');
            if (delayError) {
                const blockedUntil = loginPage.extractBlockedUntil(delayError.message);
                waitMs = blockedUntil.getTime() - Date.now() + 250;
            }

            await new Promise(r => setTimeout(r, waitMs));
        }

        await page.unroute('**/graphql/');
    })

    test('LOGIN-015 should allow login to succeed again once the rate-limit window clears', async ({ page }) => {
        let lastApiErrors = null;
        let waitMs = 500;

        await page.route('**/graphql/', async (route) => {
            const request = route.request();
            const postData = request.postDataJSON();
            const response = await route.fetch();
            const responseBody = await response.json();

            if (postData?.query?.includes('tokenCreate')) {
                lastApiErrors = responseBody.data?.tokenCreate?.errors ?? [];
            }

            await route.fulfill({ response });
        });

        for (let i = 0; i < 5; i++) {
            const messageText = await loginPage.malformedLoginAttempt('someemail', '12345');
            if (waitMs !== 500) {
                loginPage.assertErrorPairFromData(lastApiErrors[0], messageText);
                expect(messageText.trim()).toBe('Your username and/or password are incorrect. Please try again.');
                break;
            }

            if (lastApiErrors?.[0]) {
                loginPage.assertErrorPairFromData(lastApiErrors[0], messageText);
            }

            const delayError = lastApiErrors?.find(e => e.code === 'LOGIN_ATTEMPT_DELAYED');
            if (delayError) {
                const blockedUntil = loginPage.extractBlockedUntil(delayError.message);
                waitMs = blockedUntil.getTime() - Date.now() + 250;
            }

            await new Promise(r => setTimeout(r, waitMs));
        }

        await page.unroute('**/graphql/');
    })

    test('F. Session & Navigation Edge Cases', async ({ page, request }) => {
        let refreshCookie;

        await test.step('LOGIN-022 should redirect an unauthenticated user to login when visiting a protected URL directly', async () => {
            await page.waitForTimeout(1000);
            await page.goto('/dashboard/products/');
            const isRedirected = await loginPage.redirectionToLoginPage();
            expect(isRedirected).toBe(true)
        })

        await test.step('LOGIN-023 should redirect an already-authenticated user away from the login page', async () => {
            const isLoggedIn = await loginPage.login(admin.email, admin.password);
            expect(isLoggedIn).toBe(true);
            const cookies = await page.context().cookies();
            refreshCookie = cookies.find(c => c.name.toLowerCase().includes('refresh'));
            const isRedirected = await loginPage.redirectionToLoginPage();
            expect(isRedirected).toBe(false)
            expect(refreshCookie).toBeDefined();
        })

        await test.step('LOGIN-024 should persist the session across a full page reload', async () => {
            await page.reload();
            const isRedirected = await loginPage.redirectionToLoginPage();
            expect(isRedirected).toBe(false)
        })

        await test.step('LOGIN-025 should clear the session and redirect to login after logout', async () => {
            await loginPage.logout();
            const apiCtx = await pwRequest.newContext({ baseURL: process.env.SALEOR_API_URL });
            const response = await apiCtx.post('/graphql/', {
                data: {
                    query: `
                            mutation TokenRefresh($refreshToken: String!) {
                                tokenRefresh(refreshToken: $refreshToken) {
                                    token
                                    errors { field message code }
                                }
                            }
                        `,
                    variables: { refreshToken: refreshCookie.value },
                },
            });
            const body = await response.json();
            await apiCtx.dispose();
            console.log('tokenRefresh after logout result:', JSON.stringify(body));
        })
    })

    test('access token silently refreshes before its TTL expires, without forcing re-login', async ({ page }) => {
        test.setTimeout(7 * 60 * 1000);
        await loginPage.login(admin.email, admin.password);

        let tokenRefreshFired = false;
        await page.route('**/graphql/', async (route) => {
            const postData = route.request().postDataJSON();
            if (postData?.query?.includes('tokenRefresh')) tokenRefreshFired = true;
            await route.continue();
        });

        await page.waitForTimeout(5.5 * 60 * 1000);

        await page.goto('/dashboard/products/');

        const isRedirected = await loginPage.redirectionToLoginPage();
        expect(isRedirected).toBe(false);
        expect(tokenRefreshFired).toBe(true);
    });

    test('G. RBAC-Adjacent (cross-reference with Phase 1 limitedStaff)', async ({ page }) => {
        const limitedAdmin = {
            email: process.env.LIMITED_ACCESS_USER_EMAIL,
            password: process.env.LIMITED_ACCESS_USER_PASSWORD
        }

        await test.step('LOGIN-027 should allow the limited-access (MANAGE_PRODUCTS-only) staff account to log in', async () => {
            const isLoggedIn = await loginPage.login(limitedAdmin.email, limitedAdmin.password);
            expect(isLoggedIn).toBe(true);
        })

        await test.step('LOGIN-028 should hide navigation items the limited-access account has no permission for', async () => {

            const menuItemList = await loginPage.getMenuList();
            expect(menuItemList).not.toContain('Fulfillment');
            expect(menuItemList).not.toContain('Customers');
            expect(menuItemList).not.toContain('Discounts');
            expect(menuItemList).not.toContain('Modeling');
            expect(menuItemList).not.toContain('Translations');
            expect(menuItemList).not.toContain('Command menu');
            expect(menuItemList).not.toContain('Playground');
            expect(menuItemList).not.toContain(`What's New`);

            // const isLoggedIn = await loginPage.login(limitedAdmin.email, limitedAdmin.password);
            // expect(isLoggedIn).toBe(true);
            await page.goto('/dashboard/discounts/sales');
            await loginPage.pageRestrictedWith404();
        })
    })

    // Moved inside the serial block — this now inherits ordering (runs only after
    // every test above completes) and runs on the same worker, which also
    // eliminates the risk of concurrent tokenCreate calls tripping shared
    // rate-limit state across workers.
    staffTest('H. Verifying limited staff has MANAGE_PRODUCTS in permissions array', async ({ limitedStaffToken }) => {

        let mePermissions = null;
        const ctx = await pwRequest.newContext({ baseURL: process.env.SALEOR_API_URL });
        const { data } = await graphqlRequest(ctx, `
                query Me { me { userPermissions { code name } } }
            `, {}, limitedStaffToken);
        mePermissions = data.me.userPermissions;
        const codes = mePermissions.map(p => p.code);
        expect(codes).toEqual(['MANAGE_PRODUCTS']);
    })
})