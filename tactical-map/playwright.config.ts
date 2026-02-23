import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: [
    'e2e/**/*.spec.ts',
    'performance/**/*.test.ts',
    'accessibility/**/*.test.ts',
  ],
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:5174/map/',
    trace: 'on-first-retry',
    // Chrome-specific flags for performance.memory and GC access
    launchOptions: {
      args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
    },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5174',
    url: 'http://127.0.0.1:5174/map/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
