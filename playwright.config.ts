import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    browserName: 'chromium',
    headless: true,
  },
  projects: [
    {
      name: 'xss-sanitization',
      testMatch: /xss.*\.spec\.ts$/,
    },
  ],
});
