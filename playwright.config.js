require('dotenv').config();
const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  globalSetup: require.resolve('./utils/global-setup.js'),
  testDir: './tests',
  workers: 2,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }], ['json', { outputFile: 'results.json' }],  ['list']],
  use: {
    baseURL: process.env.SALEOR_API_URL || 'http://localhost:8000',
    trace: 'retain-on-failure',
    testIdAttribute: 'data-test-id',
  },
  projects: [
    {
      name: 'api',
      testDir: './tests/api',
      use: {
        baseURL: process.env.SALEOR_API_URL || 'http://localhost:8000',
        extraHTTPHeaders: { 'Content-Type': 'application/json' },
      },
    },
    {
      name: 'ui',
      testDir: './tests/ui',
      fullyParallel: false,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.SALEOR_DASHBOARD_URL || 'http://localhost:9000',
        storageState: 'playwright/.auth/admin.json',
        headless: true,
        screenshot: 'on',
        video: 'retain-on-failure',
        trace: 'retain-on-failure',
      },
    },
  ],
});