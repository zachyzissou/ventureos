/**
 * Privileged action endpoint guardrails.
 *
 * Defense-in-depth for /api/action/* endpoints:
 * 1) feature gate (disabled by default)
 * 2) localhost-only restriction by default
 * 3) optional re-auth header (explicit opt-in)
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { logAuthEvent, tokenMatch } from './auth.js';

export const ACTION_REAUTH_HEADER: string = 'x-openclaw-action-token';

function normalizeIp(ip: string): string {
  if (!ip) return ip;
  return ip.replace(/^::ffff:/, '');
}

function getPeerIp(req: IncomingMessage): string {
  return req.socket?.remoteAddress ?? 'unknown';
}

export function isLoopbackIp(ip: string): boolean {
  const cleaned: string = normalizeIp(ip);
  return cleaned === '::1' || cleaned.startsWith('127.');
}

export function areActionsEnabled(): boolean {
  return (process.env.DASHBOARD_ENABLE_ACTIONS ?? 'false').toLowerCase() === 'true';
}

export function areActionsLocalhostOnly(): boolean {
  return (process.env.DASHBOARD_ACTIONS_LOCALHOST_ONLY ?? 'true').toLowerCase() !== 'false';
}

export function isActionReauthEnabled(): boolean {
  return (process.env.DASHBOARD_ACTION_REAUTH ?? 'false').toLowerCase() === 'true';
}

function getActionReauthToken(req: IncomingMessage): string {
  const raw: string | string[] | undefined = req.headers[ACTION_REAUTH_HEADER];
  if (Array.isArray(raw)) return raw[0] ?? '';
  return typeof raw === 'string' ? raw : '';
}

export function authorizeActionRequest(req: IncomingMessage, res: ServerResponse): boolean {
  if (!req.url || !req.url.startsWith('/api/action/')) return true;

  if (!areActionsEnabled()) {
    logAuthEvent('action_blocked', req, 'Actions feature gate disabled');
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Not found' }));
    return false;
  }

  const peerIp: string = getPeerIp(req);
  if (areActionsLocalhostOnly() && !isLoopbackIp(peerIp)) {
    logAuthEvent('action_blocked', req, `Non-loopback caller denied: ${peerIp}`);
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Action endpoints require localhost access' }));
    return false;
  }

  if (isActionReauthEnabled()) {
    const reauthToken: string = getActionReauthToken(req).trim();
    if (!reauthToken || !tokenMatch(reauthToken)) {
      logAuthEvent('action_reauth_failed', req, reauthToken ? 'Invalid re-auth token' : 'Missing re-auth token');
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Re-auth required for action endpoint' }));
      return false;
    }
  }

  return true;
}
