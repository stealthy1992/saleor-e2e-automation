require('dotenv').config();
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.SALEOR_API_URL || 'https://saleor.solception.com',
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
    },
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'api',
      testDir: './tests/api',
      use: {
        baseURL: process.env.SALEOR_API_URL || 'https://saleor.solception.com',
      },
    },
    // 'dashboard' project (Playwright UI against saleor-dashboard.solception.com)
    // and 'storefront' project are deliberately not scaffolded yet — see repo README.
  ],
});