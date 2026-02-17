import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleLogs, redactSecrets } from '../../../server/routes/logs.js';

function mockReq(url: string, method = 'GET'): IncomingMessage { return { url, method, headers: {} } as unknown as IncomingMessage; }
function mockRes() {
  const r = { statusCode: 200, headers: {} as Record<string,string>, body: '', ended: false, writable: true,
    writeHead(s: number, h?: Record<string,string>) { r.statusCode = s; if (h) Object.assign(r.headers, h); },
    write(c: string) { r.body += c; return true; }, end(d?: string) { if (d) r.body += d; r.ended = true; },
    setHeader(k: string, v: string) { r.headers[k] = v; } };
  return r;
}
function json(r: ReturnType<typeof mockRes>) { return JSON.parse(r.body); }
function sendJson(res: ServerResponse, data: unknown, status = 200) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); }
function clampInt(n: string|number|null, lo: number, hi: number, dflt: number) { const v = parseInt(String(n)); return Number.isNaN(v) ? dflt : Math.max(lo, Math.min(hi, v)); }

let tmp: string, oc: string, ld: string, deps: any;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lt-')); oc = path.join(tmp, '.oc'); ld = path.join(tmp, 'l'); fs.mkdirSync(path.join(oc, 'logs'), { recursive: true }); fs.mkdirSync(ld, { recursive: true }); deps = { OPENCLAW_DIR: oc, LOG_DIR: ld, sendJson, clampInt }; });
afterEach(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} });

describe('redactSecrets', () => {
  it('redacts Bearer tokens', () => { expect(redactSecrets('Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.x')).toContain('REDACTED'); });
  it('redacts ghp tokens', () => { expect(redactSecrets('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij')).toContain('REDACTED'); });
  it('redacts home paths', () => { const r = redactSecrets('/Users/user1/data'); expect(r).not.toContain('user1'); expect(r).toContain('/Users/***'); });
  it('preserves normal text', () => { expect(redactSecrets('hello world')).toBe('hello world'); });
});

describe('/api/logs/sources', () => {
  it('returns sources', () => { const r = mockRes(); handleLogs(mockReq('/api/logs/sources'), r as any, deps); const b = json(r); expect(b.sources.length).toBeGreaterThan(0); expect(b.sources.map((s:any)=>s.id)).toContain('gateway'); });
  it('unavailable when missing', () => { const r = mockRes(); handleLogs(mockReq('/api/logs/sources'), r as any, deps); expect(json(r).sources.every((s:any)=>!s.available)).toBe(true); });
  it('available when file exists', () => { fs.writeFileSync(path.join(oc,'logs','gateway.log'),'line\n'); const r = mockRes(); handleLogs(mockReq('/api/logs/sources'), r as any, deps); expect(json(r).sources.find((s:any)=>s.id==='gateway').available).toBe(true); });
});

describe('/api/logs/read', () => {
  it('returns entries', () => { fs.writeFileSync(path.join(oc,'logs','gateway.log'),'2026-02-16T10:00:00Z [gw] ok\n2026-02-16T10:00:01Z [gw] error: fail\n'); const r = mockRes(); handleLogs(mockReq('/api/logs/read?sources=gateway&lines=100'), r as any, deps); const b = json(r); expect(b.count).toBe(2); expect(b.entries[1].level).toBe('error'); });
  it('filters level', () => { fs.writeFileSync(path.join(oc,'logs','gateway.log'),'2026-02-16T10:00:00Z ok\n2026-02-16T10:00:01Z error bad\n'); const r = mockRes(); handleLogs(mockReq('/api/logs/read?sources=gateway&level=error'), r as any, deps); expect(json(r).entries.every((e:any)=>e.level==='error')).toBe(true); });
  it('filters keyword', () => { fs.writeFileSync(path.join(oc,'logs','gateway.log'),'2026-02-16T10:00:00Z conn open\n2026-02-16T10:00:01Z timeout\n2026-02-16T10:00:02Z conn close\n'); const r = mockRes(); handleLogs(mockReq('/api/logs/read?sources=gateway&keyword=conn'), r as any, deps); expect(json(r).entries.length).toBe(2); });
  it('reads JSONL', () => { fs.writeFileSync(path.join(ld,'tactical-map-access.log'),'{"ts":"2026-02-16T10:00:00Z","event":"auth_failure","ip":"1.2.3.4","method":"GET","path":"/","detail":"bad"}\n'); const r = mockRes(); handleLogs(mockReq('/api/logs/read?sources=access'), r as any, deps); expect(json(r).entries[0].level).toBe('error'); });
  it('multi-source', () => { fs.writeFileSync(path.join(oc,'logs','gateway.log'),'2026-02-16T10:00:00Z gw\n'); fs.writeFileSync(path.join(ld,'tactical-map-access.log'),'{"ts":"2026-02-16T10:00:01Z","event":"ok","ip":"","method":"","path":"","detail":""}\n'); const r = mockRes(); handleLogs(mockReq('/api/logs/read?sources=gateway,access'), r as any, deps); expect(new Set(json(r).entries.map((e:any)=>e.source)).size).toBe(2); });
  it('redacts secrets', () => { fs.writeFileSync(path.join(oc,'logs','gateway.log'),'2026-02-16T10:00:00Z ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij\n'); const r = mockRes(); handleLogs(mockReq('/api/logs/read?sources=gateway'), r as any, deps); expect(json(r).entries[0].message).toContain('REDACTED'); });
  it('empty for unknown', () => { const r = mockRes(); handleLogs(mockReq('/api/logs/read?sources=xyz'), r as any, deps); expect(json(r).count).toBe(0); });
  it('line limit', () => { const l = Array.from({length:50},(_,i)=>'2026-02-16T10:'+String(i).padStart(2,'0')+':00Z l'+i).join('\n'); fs.writeFileSync(path.join(oc,'logs','gateway.log'),l); const r = mockRes(); handleLogs(mockReq('/api/logs/read?sources=gateway&lines=10'), r as any, deps); expect(json(r).count).toBeLessThanOrEqual(10); });
});

describe('legacy /api/logs', () => {
  it('plaintext compat', () => { fs.writeFileSync(path.join(oc,'logs','gateway.log'),'2026-02-16T10:00:00Z started\n'); const r = mockRes(); handleLogs(mockReq('/api/logs?service=openclaw&lines=50'), r as any, deps); expect(r.headers['Content-Type']).toBe('text/plain'); expect(r.body).toContain('started'); });
  it('POST returns false', () => { expect(handleLogs(mockReq('/api/logs/sources','POST'), mockRes() as any, deps)).toBe(false); });
});

describe('/api/logs/stream', () => {
  it('SSE headers', () => { const req = mockReq('/api/logs/stream?sources=gateway'); const ls: Record<string,Function[]> = {}; (req as any).on = (e:string, fn:Function) => { (ls[e]??=[]).push(fn); }; const r = mockRes(); handleLogs(req, r as any, deps); expect(r.headers['Content-Type']).toBe('text/event-stream'); expect(r.body).toContain('"type":"connected"'); ls['close']?.forEach(fn=>fn()); });
});
