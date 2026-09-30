import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './scripts',
  testMatch: 'browser.spec.mjs',
  timeout: 90000,
  use: {
    baseURL: process.env.ADA_TEST_URL || 'http://localhost:4173',
    headless: true,
    channel: process.env.CI ? 'chrome' : 'msedge',
    acceptDownloads: true,
  },
  webServer: process.env.ADA_TEST_URL ? undefined : {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173/ADA-web/',
    reuseExistingServer: false,
  },
});
