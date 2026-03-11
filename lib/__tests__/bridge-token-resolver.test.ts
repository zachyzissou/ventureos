import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const {
  resolveBridgeToken,
  readBridgeTokenOrThrow,
}: {
  resolveBridgeToken: (options?: {
    cliTokenFile?: string;
    explicitToken?: string;
    envTokenFile?: string;
    defaultTokenFile?: string;
  }) =>
    | { ok: true; token: string; source: string }
    | { ok: false; source: string; errorCode: string; errorMessage: string };
  readBridgeTokenOrThrow: (options?: {
    cliTokenFile?: string;
    explicitToken?: string;
    envTokenFile?: string;
    defaultTokenFile?: string;
  }) => { ok: true; token: string; source: string };
} = require('../bridge-token-resolver.js');

describe('bridge-token-resolver', () => {
  it('resolves precedence: cli token file > env token > env token file > default token file', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-token-resolver-'));
    const cliFile = path.join(tmp, 'cli-token');
    const envFile = path.join(tmp, 'env-token');
    const defaultFile = path.join(tmp, 'default-token');
    fs.writeFileSync(cliFile, 'cli-token\n', 'utf8');
    fs.writeFileSync(envFile, 'env-token\n', 'utf8');
    fs.writeFileSync(defaultFile, 'default-token\n', 'utf8');

    const cli = resolveBridgeToken({
      cliTokenFile: cliFile,
      explicitToken: 'env-inline',
      envTokenFile: envFile,
      defaultTokenFile: defaultFile,
    });
    expect(cli).toEqual({
      ok: true,
      token: 'cli-token',
      source: 'cli-token-file',
    });

    const envInline = resolveBridgeToken({
      explicitToken: 'env-inline',
      envTokenFile: envFile,
      defaultTokenFile: defaultFile,
    });
    expect(envInline).toEqual({
      ok: true,
      token: 'env-inline',
      source: 'env-token',
    });

    const envTokenFile = resolveBridgeToken({
      envTokenFile: envFile,
      defaultTokenFile: defaultFile,
    });
    expect(envTokenFile).toEqual({
      ok: true,
      token: 'env-token',
      source: 'env-token-file',
    });

    const fallback = resolveBridgeToken({
      defaultTokenFile: defaultFile,
    });
    expect(fallback).toEqual({
      ok: true,
      token: 'default-token',
      source: 'default-token-file',
    });
  });

  it('returns structured error for empty token files and missing token data', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-token-resolver-err-'));
    const emptyFile = path.join(tmp, 'empty-token');
    fs.writeFileSync(emptyFile, '\n', 'utf8');

    const empty = resolveBridgeToken({
      cliTokenFile: emptyFile,
    });
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.errorCode).toBe('INVALID_BRIDGE_TOKEN_FILE');
    }

    const missingDefault = resolveBridgeToken({
      defaultTokenFile: path.join(tmp, 'missing-token'),
    });
    expect(missingDefault).toEqual({
      ok: false,
      source: 'default-token-file',
      errorCode: 'INVALID_BRIDGE_TOKEN_FILE',
      errorMessage: 'bridge token file not found',
    });

    const missing = resolveBridgeToken({});
    expect(missing).toEqual({
      ok: false,
      source: 'default-token-file',
      errorCode: 'MISSING_BRIDGE_TOKEN',
      errorMessage: 'Missing BRIDGE_TOKEN (set env, BRIDGE_TOKEN_FILE, or default OpenClaw bridge token file)',
    });
  });

  it('readBridgeTokenOrThrow returns token on success and throws on error', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-token-resolver-throw-'));
    const tokenFile = path.join(tmp, 'bridge-token');
    fs.writeFileSync(tokenFile, 'abc123\n', 'utf8');

    const ok = readBridgeTokenOrThrow({ defaultTokenFile: tokenFile });
    expect(ok.token).toBe('abc123');
    expect(ok.source).toBe('default-token-file');

    expect(() => readBridgeTokenOrThrow({ defaultTokenFile: path.join(tmp, 'missing') })).toThrow(
      'bridge token file not found',
    );
    expect(() => readBridgeTokenOrThrow({})).toThrow('Missing BRIDGE_TOKEN');
  });
});
