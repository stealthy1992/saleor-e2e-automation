const { test, expect } = require('../../fixtures/customer');
const pollForConfirmationEmail = require('../../utils/confirmationToken');
const { graphqlRequest } = require('../../utils/graphql-client');
const { request: pwRequest } = require('@playwright/test');

test.describe('M9: account', () => {
    test('ACC-01: Sign up via customer fixture, then log in', async ({ page, testCustomer }) => {
        await page.goto('/en/default-channel/login');
        await page.locator('h1', { hasText: 'Welcome Back' }).waitFor({ state: 'visible' });
        // await page.locator('#email').fill('');
        await page.locator('#email').click();
        await page.locator('#email').fill(testCustomer?.email);
        await page.locator('#password').fill(testCustomer?.password);
        await page.locator('button[type="submit"]').click();
        await page.waitForURL(/default-channel/);
        // await page.pause();
        await page.locator('button', { hasText: 'Open user menu' }).waitFor({ state: 'visible' });
        await page.goto('/en/default-channel/account');
        await expect(page.locator('h1', { hasText: `Welcome back, ${testCustomer.firstName}` })).toBeVisible();
        const uiEmail = await page.locator('aside').locator('p').last().innerText();
        console.log(`Account email is ${uiEmail}`);
        expect(uiEmail.trim()).toBe(testCustomer.email.trim());
        // await expect(page.locator('aside').locator('p').last()).toHaveText(testCustomer.email);
    })
    test('ACC-02: Sign up via storefront signup page, then log in', async ({ page, staffToken }) => {
        const signUpCustomer = {
            firstName: 'Trevor',
            lastName: 'Philips',
            email: `signup-${Date.now()}-${Math.random().toString(36).slice(2)}@tester.com`,
            password: '12345678',
        };
        const ctx = await pwRequest.newContext({ baseURL: process.env.SALEOR_API_URL || 'http://localhost:8000' });
        try {
            await page.goto('/en/default-channel/signup');
            await page.locator('h1', { hasText: 'Create an Account' }).waitFor({ state: 'visible' });
            await page.locator('#firstName').fill(signUpCustomer.firstName);
            await page.locator('#lastName').fill(signUpCustomer.lastName);
            await page.locator('#email').fill(signUpCustomer.email);
            await page.locator('#password').fill(signUpCustomer.password);
            await page.locator('#confirmPassword').fill(signUpCustomer.password);
            // await page.pause();
            await expect(page.locator('#firstName')).toHaveValue(signUpCustomer.firstName);
            await expect(page.locator('#lastName')).toHaveValue(signUpCustomer.lastName);
            await expect(page.locator('#email')).toHaveValue(signUpCustomer.email);
            await page.locator('button[type="submit"]').click();
            await expect(page.locator('h2', { hasText: 'Account Created!' })).toBeVisible({ timeout: 5000 });

            const { email, token } = await pollForConfirmationEmail(signUpCustomer.email);
            const { data } = await graphqlRequest(ctx, `
            mutation AccountConfirmation($email: String!, $token: String!){
                confirmAccount(email: $email, token: $token){
                    user { id email isActive isConfirmed isStaff firstName lastName }
                    errors { field message code }
                }
            }
        `, { email, token });
            if (data.confirmAccount.errors.length) {
                throw new Error(`ACC-02 (confirm) failed: ${JSON.stringify(data.confirmAccount.errors)}`);
            }

            await page.locator('a', { hasText: 'Go to Sign In' }).click();
            await page.locator('h1', { hasText: 'Welcome Back' }).waitFor({ state: 'visible' });
            await page.locator('#email').fill(signUpCustomer.email);
            await page.locator('#password').fill(signUpCustomer.password);
            await page.locator('button[type="submit"]').click();
            await page.locator('button', { hasText: 'Open user menu' }).waitFor({ state: 'visible' });
            await page.goto('/en/default-channel/account');
            await expect(page.locator('h1', { hasText: `Welcome back, ${signUpCustomer.firstName}` })).toBeVisible();
            const uiEmail = await page.locator('aside').locator('p').last().innerText();
            expect(uiEmail.trim()).toBe(signUpCustomer.email);
        } finally {
            try {
                const { data } = await graphqlRequest(ctx,
                    `query UserByEmail($email: String!) { user(email: $email) { id } }`,
                    { email: signUpCustomer.email }, staffToken);
                if (data?.user?.id) {
                    await graphqlRequest(ctx,
                        `mutation DeleteCustomer($id: ID!) { customerDelete(id: $id) { errors { field message code } } }`,
                        { id: data.user.id }, staffToken);
                }
            } catch (err) {
                console.error(`ACC-02 cleanup failed for ${signUpCustomer.email}: ${err.message}`);
            }
            await ctx.dispose();
        }
    });
})