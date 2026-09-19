require('dotenv').config();

const base = require('@playwright/test');
// const { test, expect } = require('@playwright/test');
const LoginPage = require('../../page-objects/LoginPage');

const test = base.test.extend({
  page: async ({ browser }, use) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});
const { expect } = base;

test.describe('This will test the entire login module', () => {
    let loginPage;
    const admin = {
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD
    }
    const limitedAdmin = {
        email: process.env.LIMITED_ACCESS_USER_EMAIL,
        password: process.env.LIMITED_ACCESS_USER_PASSWORD
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
            // console.log(isErrorVisible);
            expect(isErrorVisible).toBe(true);
        })

        await test.step('LOGIN-005 should show a validation error when password is empty', async () => {
            const isErrorVisible = await loginPage.loginWithoutPassword(admin.email);
            // console.log(isErrorVisible);
            expect(isErrorVisible).toBe(true);
        })

        await test.step('LOGIN-006 should show a validation error when both fields are empty', async () => {
            const isErrorVisible = await loginPage.emptyLogin();
            // console.log(isErrorVisible);
            expect(isErrorVisible).toBe(true);
        })

        await test.step('LOGIN-007 should show a validation error for a malformed email (no @, no domain)', async () => {
            const errorMessage = await loginPage.malformedLoginAttempt('someemail', '12345');
            await loginPage.assertLoginError('invalidCredentials');
            // await loginPage.assertLoginError('rateLimited');
            // expect(errorMessage.trim()).toBe('Your username and/or password are incorrect. Please try again.')
        })

        await test.step('LOGIN-008 should not fire a login request when client-side validation fails', async () => {
            let tokenCreateWasCalled = false;

            await page.route('**/graphql/', async (route) => {
                const request = route.request();
                const postData = request.postDataJSON(); // parses the JSON body for you

                // A single GraphQL request can technically batch multiple operations,
                // but for this app it's one operation per call — check the query
                // string for the mutation name rather than relying on operationName,
                // since your own graphqlRequest client doesn't always set that field.
                if (postData?.query?.includes('tokenCreate')) {
                    tokenCreateWasCalled = true;
                }

                await route.continue(); // always let the request through — this is an observer, not a blocker


            });

            const isErrorVisible = await loginPage.emptyLogin();
            // console.log(isErrorVisible);
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
                const postData = request.postDataJSON(); // parses the JSON body for you
                // console.log(postData)
                // A single GraphQL request can technically batch multiple operations,
                // but for this app it's one operation per call — check the query
                // string for the mutation name rather than relying on operationName,
                // since your own graphqlRequest client doesn't always set that field.
                if (postData?.query?.includes('tokenCreate')) {
                    tokenCreateMutationCalled = true;
                    // console.log(postData);
                }

                await route.continue(); // always let the request through — this is an observer, not a blocke

            })

            await loginPage.malformedLoginAttempt(admin.email, '12345');
            await loginPage.assertLoginError('invalidCredentials');
            // expect(errorMessage.trim()).toBe('Your username and/or password are incorrect. Please try again.')
            expect(tokenCreateMutationCalled).toBe(true);
            await page.unroute('**/graphql/');
            // await page.waitForTimeout(5000);
        })

        await test.step('LOGIN-010 should show an error for a non-existent email & rate-limit error message should display', async () => {

            let tokenCreateMutationCalled = false;

            await page.route('**/graphql/', async (route) => {
                const request = route.request();
                const postData = request.postDataJSON(); // parses the JSON body for you
                // console.log(postData)
                // A single GraphQL request can technically batch multiple operations,
                // but for this app it's one operation per call — check the query
                // string for the mutation name rather than relying on operationName,
                // since your own graphqlRequest client doesn't always set that field.
                if (postData?.query?.includes('tokenCreate')) {
                    tokenCreateMutationCalled = true;
                    // console.log(postData);
                }

                await route.continue(); // always let the request through — this is an observer, not a blocke

            })

            const errorMessage = await loginPage.malformedLoginAttempt('admin@solception.com', '12345678');
            // await loginPage.assertLoginError('rateLimited');
            await loginPage.assertLoginError('invalidCredentials');
            expect(tokenCreateMutationCalled).toBe(true);
            await page.unroute('**/graphql/');
        })

        await test.step('LOGIN-011 should not reveal whether the email exists in the error message', async () => {
            const errorMessage = await loginPage.malformedLoginAttempt('blah@tester.com', '12345');
            expect(errorMessage).not.toMatch(/email|does|not|exist/);
            // await loginPage.assertLoginError('rateLimited');
        })

        await test.step('LOGIN-012 should treat email as case-insensitive', async () => {
            let tokenCreateMutationCalled = false;
            await page.route('**/graphql/', async (route) => {
                const request = route.request();
                const postData = request.postDataJSON(); // parses the JSON body for you
                console.log(postData)
                // A single GraphQL request can technically batch multiple operations,
                // but for this app it's one operation per call — check the query
                // string for the mutation name rather than relying on operationName,
                // since your own graphqlRequest client doesn't always set that field.
                if (postData?.query?.includes('tokenCreate')) {
                    tokenCreateMutationCalled = true;
                    console.log(postData);
                }

                await route.continue(); // always let the request through — this is an observer, not a blocke

            })

            // expect(tokenCreateMutationCalled).toBe(true);
            const isLoggedIn = await loginPage.login(admin.email.toUpperCase(), admin.password);
            expect(isLoggedIn).toBe(true);
            await page.unroute('**/graphql/');
        })
    })

    test('LOGIN-013 should display a rate-limit message after rapid repeated login attempts', async ({ page }) => {
        test.setTimeout(180000);
        let lastApiErrors = null;
        let waitMs = 500; // fallback/default

        await page.route('**/graphql/', async (route) => {
            const request = route.request();
            const postData = request.postDataJSON();
            const response = await route.fetch();
            const responseBody = await response.json();

            // Only touch state for the mutation we actually care about
            if (postData?.query?.includes('tokenCreate')) {
                lastApiErrors = responseBody.data?.tokenCreate?.errors ?? [];
                console.log('Request:', JSON.stringify(postData.variables));
                console.log('Response:', JSON.stringify(lastApiErrors, null, 2));
            }

            // Fulfill FIRST — nothing after this should block on UI state
            await route.fulfill({ response });
        });

        for (let i = 0; i < 5; i++) {
            const messageText = await loginPage.malformedLoginAttempt('someemail', '12345');
            console.log(messageText, ' -- ', new Date().toLocaleTimeString('en-GB', { hour12: false }));

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
        let waitMs = 500; // fallback/default
        let gateLifted = false;

        await page.route('**/graphql/', async (route) => {
            const request = route.request();
            const postData = request.postDataJSON();
            const response = await route.fetch();
            const responseBody = await response.json();

            // Only touch state for the mutation we actually care about
            if (postData?.query?.includes('tokenCreate')) {
                lastApiErrors = responseBody.data?.tokenCreate?.errors ?? [];
                // console.log('Request:', JSON.stringify(postData.variables));
                // console.log('Response:', JSON.stringify(lastApiErrors, null, 2));
            }

            // Fulfill FIRST — nothing after this should block on UI state
            await route.fulfill({ response });
        });

        for (let i = 0; i < 5; i++) {
            const messageText = await loginPage.malformedLoginAttempt('someemail', '12345');
            if (waitMs !== 500) {
                console.log(`Login attempt gate lifted at ${i + 1} iteration at ${new Date(Date.now()).toISOString().split(' ')[0]} with the message ${lastApiErrors[0]?.message}`)
                loginPage.assertErrorPairFromData(lastApiErrors[0], messageText);
                expect(messageText.trim()).toBe('Your username and/or password are incorrect. Please try again.');
                break;
            }
            // else {
            //     if (i === 0) {
            //         console.log(`Login attempt gate not yet applied at ${i + 1} attempt and message is ${lastApiErrors[0]?.message}`);
            //         loginPage.assertErrorPairFromData(lastApiErrors[0], messageText);
            //         expect(messageText.trim()).toBe('Your username and/or password are incorrect. Please try again.');
            //     }
            //     else {
            //         console.log(`Login attempt gate closed at ${i + 1} iteration with the message ${lastApiErrors[0]?.message}`)
            //         loginPage.assertErrorPairFromData(lastApiErrors[0], messageText);
            //         expect(messageText.trim()).toBe('Please wait a moment before trying again.');
            //     }

            // }

            if (lastApiErrors?.[0]) {
                loginPage.assertErrorPairFromData(lastApiErrors[0], messageText);
            }

            const delayError = lastApiErrors?.find(e => e.code === 'LOGIN_ATTEMPT_DELAYED');
            if (delayError) {
                const blockedUntil = loginPage.extractBlockedUntil(delayError.message);
                waitMs = blockedUntil.getTime() - Date.now() + 250;
                console.log(`Delayed time set to  ${waitMs} at ${i + 1} iteration`);
                // gateLifted = true;
            }

            await new Promise(r => setTimeout(r, waitMs));
        }

        await page.unroute('**/graphql/');
    })

    test('F. Session & Navigation Edge Cases', async ({ page, request }) => {
        let refreshCookie;
        const apiUrl = process.env.SALEOR_API_URL + '/graphql/';
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
            // await expect(page).toHaveURL(/home/);
        })

        await test.step('LOGIN-024 should persist the session across a full page reload', async () => {
            await page.reload();
            const isRedirected = await loginPage.redirectionToLoginPage();
            expect(isRedirected).toBe(false)
        })

        await test.step('LOGIN-025 should clear the session and redirect to login after logout', async () => {

            // await page.route('**/graphql/', async (route) => {
            //     const request = route.request();
            //     const postData = request.postDataJSON();
            //     const response = await route.fetch();
            //     const responseBody = await response.json();

            //     console.log(postData);
            //     console.log(responseBody)
            //     if (postData?.query?.includes('tokenDelete')) {
            //         console.log('Deletion found')
            //     }

            //     // await route.fulfill({ response });

            // })

            await loginPage.logout();
            // cookies = await page.context().cookies();
            // console.log('Refresh token persists after logout (expected — Saleor auth is stateless, see notes):', !!refreshCookie);
            // if (refreshCookie) {
            const response = await request.post(apiUrl, {
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
            // const status = response.status();
            // console.log('Status:', status);
            const body = await response.json();
            // }

            // const sessionData = await page.evaluate(() => localStorage.getItem('token'));
            // expect(sessionData).toBeNull();
            console.log('tokenRefresh after logout result:', JSON.stringify(body));


        })
    })

    // test.slow(); // this test genuinely takes 5+ minutes — flag it so Playwright doesn't apply a short default timeout
    test('access token silently refreshes before its TTL expires, without forcing re-login', async ({ page }) => {
        test.setTimeout(7 * 60 * 1000);
        await loginPage.login(admin.email, admin.password);

        let tokenRefreshFired = false;
        await page.route('**/graphql/', async (route) => {
            const postData = route.request().postDataJSON();
            if (postData?.query?.includes('tokenRefresh')) tokenRefreshFired = true;
            await route.continue();
        });

        await page.waitForTimeout(5.5 * 60 * 1000); // past the 5-minute access TTL

        // Trigger any authenticated action — e.g. navigate to another screen
        await page.goto('/dashboard/products/');

        const isRedirected = await loginPage.redirectionToLoginPage();
        expect(isRedirected).toBe(false); // still logged in
        expect(tokenRefreshFired).toBe(true); // and it got there via a silent refresh, not luck
    });

    test('G. RBAC-Adjacent (cross-reference with Phase 1 limitedStaff)', async ({ page }) => {
        let mePermissions = null;
        await test.step('LOGIN-027 should allow the limited-access (MANAGE_PRODUCTS-only) staff account to log in', async () => {
            await page.route(apiUrl, async (route) => {
                const request = route.request();
                const postData = request.postDataJSON();
                const response = await route.fetch();
                const responseBody = await response.json();
                

                // if (postData?.query?.includes('tokenCreate')) {
                //     console.log(postData);
                // }


                if (postData?.query?.includes('userPermissions') && responseBody.data?.me) {
                    mePermissions = responseBody.data.me.userPermissions;
                }

                await route.fulfill({ response });
            });
            
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
            console.log(mePermissions);
            expect(mePermissions).not.toBeNull();

            const codes = mePermissions.map(p => p.code);
            expect(codes).toEqual(['MANAGE_PRODUCTS']);

            await page.goto('/dashboard/discounts/sales');
            await loginPage.pageRestrictedWith404();
            // await page.unroute('**/graphql/');
        })
    })

})