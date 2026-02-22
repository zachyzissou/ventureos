const fs = require('node:fs');

function normalizeToken(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function readTokenFromFile(filePath) {
  if (!filePath) {
    return { ok: false, errorMessage: 'bridge token file path is empty' };
  }
  if (!fs.existsSync(filePath)) {
    return { ok: false, errorMessage: 'bridge token file not found' };
  }
  const token = normalizeToken(fs.readFileSync(filePath, 'utf8'));
  if (!token) {
    return { ok: false, errorMessage: 'bridge token file is empty' };
  }
  return { ok: true, token };
}

function resolveBridgeToken(options = {}) {
  const cliTokenFile = normalizeToken(options.cliTokenFile);
  const explicitToken = normalizeToken(options.explicitToken);
  const envTokenFile = normalizeToken(options.envTokenFile);
  const defaultTokenFile = normalizeToken(options.defaultTokenFile);

  if (cliTokenFile) {
    const read = readTokenFromFile(cliTokenFile);
    if (!read.ok) {
      return {
        ok: false,
        source: 'cli-token-file',
        errorCode: 'INVALID_BRIDGE_TOKEN_FILE',
        errorMessage: read.errorMessage,
      };
    }
    return {
      ok: true,
      token: read.token,
      source: 'cli-token-file',
    };
  }

  if (explicitToken) {
    return {
      ok: true,
      token: explicitToken,
      source: 'env-token',
    };
  }

  if (envTokenFile) {
    const read = readTokenFromFile(envTokenFile);
    if (!read.ok) {
      return {
        ok: false,
        source: 'env-token-file',
        errorCode: 'INVALID_BRIDGE_TOKEN_FILE',
        errorMessage: read.errorMessage,
      };
    }
    return {
      ok: true,
      token: read.token,
      source: 'env-token-file',
    };
  }

  const fallback = readTokenFromFile(defaultTokenFile);
  if (fallback.ok) {
    return {
      ok: true,
      token: fallback.token,
      source: 'default-token-file',
    };
  }

  if (defaultTokenFile) {
    return {
      ok: false,
      source: 'default-token-file',
      errorCode: 'INVALID_BRIDGE_TOKEN_FILE',
      errorMessage: fallback.errorMessage,
    };
  }

  return {
    ok: false,
    source: 'default-token-file',
    errorCode: 'MISSING_BRIDGE_TOKEN',
    errorMessage: 'Missing BRIDGE_TOKEN (set env, BRIDGE_TOKEN_FILE, or default OpenClaw bridge token file)',
  };
}

function readBridgeTokenOrThrow(options = {}) {
  const resolved = resolveBridgeToken(options);
  if (!resolved.ok) {
    throw new Error(resolved.errorMessage);
  }
  return resolved;
}

module.exports = {
  resolveBridgeToken,
  readBridgeTokenOrThrow,
};
