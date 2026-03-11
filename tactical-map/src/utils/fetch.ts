import { API } from '@/config';

export type FetchOptions = {
  timeoutMs?: number;
  headers?: Record<string, string>;
};

export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const parts = document.cookie.split(';').map((p) => p.trim());
  for (const p of parts) {
    if (p.startsWith(name + '=')) return decodeURIComponent(p.slice(name.length + 1));
  }
  return null;
}

export function getAuthToken(): string | null {
  const maybeLs: unknown = typeof localStorage !== 'undefined' ? localStorage : null;
  const ls =
    maybeLs && typeof (maybeLs as Storage).getItem === 'function' ? (maybeLs as Storage) : null;

  return (
    ls?.getItem('token') ||
    ls?.getItem('authToken') ||
    ls?.getItem('auth_token') ||
    getCookie('token') ||
    getCookie('authToken')
  );
}

export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? API.TIMEOUT_MS;
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  // Node's fetch requires absolute URLs; browsers accept relative.
  const finalUrl =
    url.startsWith('/')
      ? typeof location !== 'undefined'
        ? new URL(url, location.origin).toString()
        : new URL(url, 'http://localhost').toString()
      : url;

  try {
    const res = await fetch(finalUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(opts.headers ?? {})
      },
      signal: controller.signal
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} for ${url}${body ? `: ${body}` : ''}`);
    }

    return (await res.json()) as T;
  } finally {
    globalThis.clearTimeout(timer);
  }
}
