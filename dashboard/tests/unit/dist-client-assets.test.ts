/**
 * Verify that the compile script copies client assets into dist.
 *
 * Bug context (Issue #178):
 *   The compiled server resolves login.html and index.html relative to
 *   import.meta.dirname (i.e. dist/dashboard/server/) via `../client/`.
 *   TypeScript only emits .ts → .js; static HTML/CSS assets must be
 *   copied explicitly by the compile script.
 *
 * This test runs `npm run compile` then asserts the critical client
 * files exist under dist/dashboard/client/.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DASHBOARD_DIR = path.resolve(import.meta.dirname, '../..');

describe('compile produces client assets in dist', () => {
  beforeAll(() => {
    // Clean dist/dashboard/client to prove compile recreates it
    const distClient = path.join(DASHBOARD_DIR, 'dist', 'dashboard', 'client');
    fs.rmSync(distClient, { recursive: true, force: true });

    execSync('npm run compile', { cwd: DASHBOARD_DIR, stdio: 'pipe' });
  }, 60_000);

  it('dist/dashboard/client/login.html exists', () => {
    const p = path.join(DASHBOARD_DIR, 'dist', 'dashboard', 'client', 'login.html');
    expect(fs.existsSync(p)).toBe(true);
  });

  it('dist/dashboard/client/index.html exists', () => {
    const p = path.join(DASHBOARD_DIR, 'dist', 'dashboard', 'client', 'index.html');
    expect(fs.existsSync(p)).toBe(true);
  });

  it('dist/dashboard/client/assets/ directory exists', () => {
    const p = path.join(DASHBOARD_DIR, 'dist', 'dashboard', 'client', 'assets');
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.statSync(p).isDirectory()).toBe(true);
  });
});
