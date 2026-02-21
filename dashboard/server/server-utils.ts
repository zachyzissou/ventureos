import fs from 'node:fs';
import crypto from 'node:crypto';

import type { IncomingMessage, ServerResponse } from 'node:http';
import { COOKIE_NAME } from './middleware/auth.js';

export function safeReadJson(filePath: string, fallback: null): Record<string, unknown> | null;
export function safeReadJson(filePath: string, fallback: Record<string, unknown>): Record<string, unknown>;
export function safeReadJson(
  filePath: string,
  fallback: Record<string, unknown> | null,
): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return fallback;
  }
}

export function safeReadText(filePath: string, fallback: string): string {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

export function sendJson(res: ServerResponse, data: unknown, status: number = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export function clampInt(n: string | number | null, lo: number, hi: number, dflt: number): number {
  const v: number = parseInt(String(n));
  if (Number.isNaN(v)) return dflt;
  return Math.max(lo, Math.min(hi, v));
}

export function readEnvFlag(name: string, fallback = false): boolean {
  const raw = (process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  return fallback;
}

export async function readRequestBody(
  req: IncomingMessage,
  opts: { maxBytes?: number } = {},
): Promise<string> {
  const maxBytes: number = opts.maxBytes ?? 1024 * 1024;
  return await new Promise<string>((resolve, reject) => {
    let data: string = '';
    let bytes: number = 0;
    req.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        try {
          req.destroy();
        } catch {
          // ignore
        }
        reject(new Error('Request body too large'));
        return;
      }
      data += chunk.toString('utf8');
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export function isHttpsRequest(req: IncomingMessage): boolean {
  const xfProto: string = ((req?.headers?.['x-forwarded-proto'] as string | undefined) ?? '').toLowerCase();
  return xfProto === 'https' || !!(req?.socket as { encrypted?: boolean })?.encrypted;
}

export function buildAuthCookie(
  req: IncomingMessage,
  token: string,
  opts: { maxAgeSeconds?: number } = {},
): string {
  const maxAgeSeconds: number = opts.maxAgeSeconds ?? 60 * 60 * 24 * 30;
  const parts: string[] = [];
  parts.push(`${COOKIE_NAME}=${encodeURIComponent(token)}`);
  parts.push('Path=/');
  parts.push('HttpOnly');
  parts.push('SameSite=Strict');
  parts.push(`Max-Age=${maxAgeSeconds}`);
  if (isHttpsRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

export function buildClearAuthCookie(
  req: IncomingMessage,
): string {
  const parts: string[] = [];
  parts.push(`${COOKIE_NAME}=`);
  parts.push('Path=/');
  parts.push('HttpOnly');
  parts.push('SameSite=Strict');
  parts.push('Max-Age=0');
  if (isHttpsRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

export function timingSafeStringEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aa: Buffer = Buffer.from(a);
  const bb: Buffer = Buffer.from(b);
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}
