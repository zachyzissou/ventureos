/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/lib/__tests__/setup-kpi-fixtures.ts'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  modulePathIgnorePatterns: ['<rootDir>/runtime/', '<rootDir>/tmp/', '<rootDir>/logs/'],
  verbose: true
};
