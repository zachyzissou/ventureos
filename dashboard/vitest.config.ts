import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      lines: 50,
      functions: 50,
      branches: 40,
      statements: 50,
      include: [
        'server/middleware/**/*.ts',
        'server/routes/**/*.ts',
        'server/config.ts',
        'server/server.ts',
        'server/types.ts',
      ],
      exclude: [
        'server/routes/rpg.ts',
        'server/routes/conversation.ts',
      ],
    },
    testTimeout: 15000,
    hookTimeout: 15000,
    // Use vitest's transform to handle .js → .ts resolution for ESM packages
    server: {
      deps: {
        inline: [/ventureos-dashboard/],
      },
    },
  },
});
