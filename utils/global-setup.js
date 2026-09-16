const { chromium, selectors } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const LoginPage = require('../page-objects/LoginPage');
require('dotenv').config();

selectors.setTestIdAttribute('data-test-id'); // must run before any browser/page is created

async function saveSession(email, password, outputFile) {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    const loginPage = new LoginPage(page);

    await page.goto(process.env.SALEOR_DASHBOARD_URL + '/dashboard');
    const isLoggedIn = await loginPage.login(email, password);
    if (!isLoggedIn) throw new Error(`global-setup: login failed for ${email}`);
    await loginPage.loginConfirmed();

    const authDir = path.join(__dirname, '..', 'playwright', '.auth');
    fs.mkdirSync(authDir, { recursive: true });
    const authFilePath = path.join(authDir, outputFile);
    await context.storageState({ path: authFilePath });
    console.log(`Storage state saved to: ${authFilePath}`);
    await browser.close();
}

module.exports = async () => {
    await saveSession(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD, 'admin.json');
    await saveSession(process.env.LIMITED_ACCESS_USER_EMAIL, process.env.LIMITED_ACCESS_USER_PASSWORD, 'limited-staff.json');
};

if (require.main === module) { module.exports(); }