/**
 * Regression tests for incident-report ESM/CJS module loading — Issue #199
 *
 * Verifies that the compiled dist artifact for incident-report can be loaded
 * by the dashboard server runtime (ESM context) without module-format errors.
 *
 * Root cause: dashboard/package.json sets "type": "module", but the compiled
 * incident-report script under dist/scripts/ emits CJS (exports/require).
 * Without a local {"type":"commonjs"} package.json in dist/scripts/, Node
 * interprets the .js file as ESM and fails with "exports is not defined".
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const DASHBOARD_ROOT = path.resolve(import.meta.dirname, '..', '..');
const DIST_SCRIPTS = path.join(DASHBOARD_ROOT, 'dist', 'scripts');
const DIST_SCRIPTS_PKG = path.join(DIST_SCRIPTS, 'package.json');
const DIST_INCIDENT_JS = path.join(DIST_SCRIPTS, 'incident-report.js');

describe('Incident Report Module Load (Issue #199 regression)', () => {
  it('dist/scripts/package.json exists with type: commonjs', () => {
    // Guard: if dist hasn't been compiled yet, skip gracefully
    if (!fs.existsSync(DIST_SCRIPTS)) {
      console.warn('[skip] dist/scripts/ not present — run `npm run compile` first');
      return;
    }

    expect(fs.existsSync(DIST_SCRIPTS_PKG)).toBe(true);
    const pkg = JSON.parse(fs.readFileSync(DIST_SCRIPTS_PKG, 'utf8'));
    expect(pkg.type).toBe('commonjs');
  });

  it('compiled incident-report.js can be loaded via dynamic import (ESM context)', async () => {
    if (!fs.existsSync(DIST_INCIDENT_JS)) {
      console.warn('[skip] dist/scripts/incident-report.js not present — run `npm run compile` first');
      return;
    }

    // This mirrors what the server does: dynamic import from ESM context
    const mod = await import(DIST_INCIDENT_JS);
    expect(mod).toBeDefined();
    expect(typeof mod.generateIncidentBundle).toBe('function');
  });

  it('generateIncidentBundle returns a valid bundle from dist artifact', async () => {
    if (!fs.existsSync(DIST_INCIDENT_JS)) {
      console.warn('[skip] dist/scripts/incident-report.js not present');
      return;
    }

    const { generateIncidentBundle } = await import(DIST_INCIDENT_JS);
    const bundle = await generateIncidentBundle(1);

    expect(bundle).toBeDefined();
    expect(bundle.generatedAt).toBeTruthy();
    expect(bundle.generator).toContain('ventureos-incident-report');
    expect(bundle.sections).toBeDefined();
    expect(bundle.sections.systemSnapshot).toHaveProperty('hostname');
  });

  it('compile script creates dist/scripts/package.json', () => {
    // Verify the compile script in package.json includes the dist/scripts fix
    const pkgPath = path.join(DASHBOARD_ROOT, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const compileScript: string = pkg.scripts?.compile ?? '';

    expect(compileScript).toContain('dist/scripts');
    expect(compileScript).toContain('"type":"commonjs"');
  });
});
