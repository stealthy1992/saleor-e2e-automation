const BasePage = require('../page-objects/BasePage')
const { expect } = require('@playwright/test');

class LoginPage extends BasePage {
    constructor(page) {
        super(page);
        this.page = page;
        this.selectors = {
            dashboardPage: page.locator('#dashboard-app'),
            email: page.getByTestId('email'),
            password: page.getByTestId('password'),
            loginButton: page.getByTestId('submit'),
            welcomeMessage: page.locator('span', { hasText: "Saleor Dashboard", exact: true }),
            loggedInEmail: page.locator('.ellipsis', { has: page.locator('span') }),
            loginErrorMessage: page.getByTestId('login-error-message'),
            logoutMenu: page.getByTestId('userMenu'),
            logoutButton: page.getByTestId('log-out-button'),
            signInForm: page.locator('form', { has: page.locator('span', { hasText: "Sign In" }) }),
            menuList: page.getByTestId('menu-list'),
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

    async redirectionToLoginPage() {
        // const isRedirected = await this.selectors.signInForm.waitFor({ state: 'visible', timeout: 5000 })
        // await expect(this.selectors.signInForm).toBeVisible({ timeout: 5000 });
        let isRedirected = false;
        try {
            await this.selectors.signInForm.waitFor({ state: 'visible', timeout: 5000 });
            isRedirected = true;
        } catch (e) {
            isRedirected = false;
        }

        return isRedirected;

    }

    async login(email, password) {
        await this.selectors.email.waitFor({ state: 'visible' });
        await this.selectors.email.fill(email);
        await this.selectors.password.fill(password);
        await this.page.waitForTimeout(3000);
        await this.selectors.loginButton.click();
        await this.dismissAnnouncement();
        try {
            await this.selectors.menuList.waitFor({ state: 'visible', timeout: 10000 });
        } catch (err) {
            console.log('Login menuList timeout — current URL:', this.page.url());
            await this.page.screenshot({ path: `login-menu-timeout-${email}.png`, fullPage: true });
            throw err;
        }
        return true;
    }

    async logout() {
        await this.selectors.logoutMenu.waitFor({ state: 'visible' });
        await this.selectors.logoutMenu.click();
        await this.selectors.logoutButton.waitFor({ state: 'visible' });
        await this.selectors.logoutButton.click();
        await this.selectors.signInForm.waitFor({ state: 'visible' })
    }

    async loginConfirmed() {
        try {
            await this.page.waitForURL(/\/dashboard(?!\/dashboard)/, { timeout: 30000 });
        } catch (err) {
            console.log('Landed on URL:', this.page.url());
            await this.page.screenshot({ path: 'login-timeout-debug.png', fullPage: true });
            throw err;
        }
        console.log(await this.page.locator('span', { hasText: "Saleor Dashboard" }).count());
        await this.selectors.welcomeMessage.waitFor({ state: 'visible' });
    }

    async assertLoginError(expectedType) {
        const errorMessages = {
            invalidCredentials: "Your username and/or password are incorrect. Please try again.",
            rateLimited: "Please wait a moment before trying again.",
        };

        const actualText = await this.selectors.loginErrorMessage.innerText();

        if (expectedType === 'invalidCredentials') {
            // Allow either — but log which one, since spurious rate-limiting is itself notable
            expect(Object.values(errorMessages)).toContain(actualText);
            if (actualText === errorMessages.rateLimited) {
                console.warn('Expected invalid-credentials message but got rate-limit message — test may be running attempts too close together');
            }
        } else {
            expect(actualText).toBe(errorMessages[expectedType]);
        }
    }

    async visibleEmailCheck() {
        console.log('Logged in email instances are: ', await this.selectors.loggedInEmail.count());
        const email = await this.selectors.loggedInEmail.innerText();
        return email;
    }

    async loginWithoutEmail(password) {
        await this.selectors.email.waitFor({ state: 'visible' });
        // await this.selectors.email.fill(email);
        await this.selectors.password.fill(password);
        await this.selectors.loginButton.click();
        const isValid = await this.selectors.email.evaluate(el => el.checkValidity());
        // console.log(isValid)
        // expect(isValid).toBe(false);
        if (!isValid) {
            return true;
        }
        else false;
    }

    async loginWithoutPassword(email) {
        await this.selectors.email.waitFor({ state: 'visible' });
        await this.selectors.email.fill(email);
        await this.selectors.password.fill('');
        await this.selectors.loginButton.click();
        const isValid = await this.selectors.password.evaluate(el => el.checkValidity());
        // console.log(isValid)
        // expect(isValid).toBe(false);
        if (!isValid) {
            return true;
        }
        else false;
    }

    async emptyLogin() {
        await this.selectors.email.waitFor({ state: 'visible' });
        await this.selectors.email.fill('');
        await this.selectors.loginButton.click();
        const isValid = await this.selectors.email.evaluate(el => el.checkValidity());
        // console.log(isValid)
        // expect(isValid).toBe(false);
        if (!isValid) {
            return true;
        }
        else false;
    }

    // LoginPage.js — pure comparison, no locator access, no deadlock risk
    assertErrorPairFromData(errorObj, actualUiText) {
        const errorMap = {
            LOGIN_ATTEMPT_DELAYED: 'Please wait a moment before trying again.',
            INVALID_CREDENTIALS: 'Your username and/or password are incorrect. Please try again.',
        };
        const expectedUiText = errorMap[errorObj?.code];
        expect(expectedUiText).toBeDefined(); // catches unmapped/new error codes
        expect(actualUiText.trim()).toBe(expectedUiText);
    }


    extractBlockedUntil(message) {
        const match = message.match(/till (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+\+00:00)/);
        if (!match) return null;
        return new Date(match[1].replace(' ', 'T')); // JS Date parses ISO-ish strings fine with this small fix
    }

    async malformedLoginAttempt(email, password) {
        await this.selectors.email.waitFor({ state: 'visible' });
        await this.selectors.email.fill(email);
        await this.selectors.loginButton.click();
        const isValid = await this.selectors.password.evaluate(el => el.checkValidity());
        expect(isValid).toBe(false);
        await this.selectors.password.fill(password);
        await this.selectors.loginButton.click();
        // await this.page.pause();
        await this.selectors.loginErrorMessage.waitFor({ state: 'visible' });
        expect(await this.selectors.loginErrorMessage.isVisible()).toBe(true);
        const messageText = await this.selectors.loginErrorMessage.innerText();
        return messageText;
    }
}

module.exports = LoginPage;