/**
 * Logs route handlers — Issue #137: Observability Logs Page.
 * Multi-source log reading with secret redaction, filtering, and live SSE streaming.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9\-_=.]{8,}/gi,
  /(?:token|key|secret|password|authorization|api[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9\-_=.]{16,}["']?/gi,
  /ghp_[A-Za-z0-9]{36,}/g, /gho_[A-Za-z0-9]{36,}/g, /github_pat_[A-Za-z0-9_]{20,}/g, /npm_[A-Za-z0-9]{36,}/g,
  /\/Users\/[a-zA-Z0-9._-]+/g, /\/home\/[a-zA-Z0-9._-]+/g,
];

export function redactSecrets(text: string): string {
  let r = text;
  for (const p of SECRET_PATTERNS) { p.lastIndex = 0; r = r.replace(p, (m) => m.startsWith('/Users/') || m.startsWith('/home/') ? m.split('/').slice(0,2).join('/')+'/***' : m.length>12 ? m.substring(0,8)+'***REDACTED***' : '***REDACTED***'); }
  return r;
}

export interface LogSource { id: string; name: string; description: string; type: 'plaintext'|'jsonl'; path: string|null; available: boolean; }
export interface ParsedLogEntry { timestamp: string; level: 'info'|'warn'|'error'|'debug'|'unknown'; source: string; message: string; raw: string; meta?: Record<string,string>; }
export interface LogsDeps { OPENCLAW_DIR: string; LOG_DIR: string; sendJson: (res: ServerResponse, data: unknown, status?: number) => void; clampInt: (n: string|number|null, lo: number, hi: number, dflt: number) => number; }

const ISO_TS = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?(?:[+-]\d{2}:\d{2})?)/;
const TAG_RE = /\[([^\]]+)\]/;
const LVL: Record<string, ParsedLogEntry['level']> = { error:'error', err:'error', warn:'warn', warning:'warn', info:'info', debug:'debug', fatal:'error', critical:'error' };

function parsePlain(line: string, src: string): ParsedLogEntry|null {
  const t = line.trim(); if (!t) return null;
  let ts = '', rest = t; const m = t.match(ISO_TS); if (m) { ts = m[1]; rest = t.slice(m[0].length).trim(); }
  let tag = ''; const tm = rest.match(TAG_RE); if (tm) { tag = tm[1]; rest = rest.slice(tm[0].length).trim(); }
  let level: ParsedLogEntry['level'] = 'info'; const low = rest.toLowerCase();
  for (const [kw, lv] of Object.entries(LVL)) { if (low.includes(kw)) { level = lv; break; } }
  const meta: Record<string,string> = {}; if (tag) meta.tag = tag;
  return { timestamp: ts||new Date().toISOString(), level, source: src, message: redactSecrets(rest), raw: redactSecrets(t), meta };
}

function parseJson(line: string, src: string): ParsedLogEntry|null {
  const t = line.trim(); if (!t) return null;
  try {
    const o = JSON.parse(t) as Record<string,unknown>;
    const ts = (o.ts as string)??(o.timestamp as string)??new Date().toISOString();
    const ev = (o.event as string)??'', detail = (o.detail as string)??'', ip = (o.ip as string)??'', method = (o.method as string)??'', p = (o.path as string)??'';
    let level: ParsedLogEntry['level'] = 'info'; const el = ev.toLowerCase();
    if (el.includes('fail')||el.includes('error')||el.includes('block')) level = 'error';
    else if (el.includes('warn')||el.includes('suspicious')||el.includes('brute')) level = 'warn';
    let msg = ev; if (method&&p) msg += ` ${method} ${p}`; if (ip) msg += ` from ${ip}`; if (detail) msg += ` — ${detail}`;
    const meta: Record<string,string> = {}; if (ev) meta.event = ev; if (ip) meta.ip = ip; if (method) meta.method = method;
    return { timestamp: ts, level, source: src, message: redactSecrets(msg), raw: redactSecrets(t), meta };
  } catch { return parsePlain(t, src); }
}

function readTail(fp: string, n: number): string[] {
  try { if (!fs.existsSync(fp)) return []; const st = fs.statSync(fp); if (st.size===0) return [];
    if (st.size < 1024*1024) return fs.readFileSync(fp,'utf8').split('\n').filter(l=>l.trim()).slice(-n);
    const sz = Math.min(st.size, n*500), buf = Buffer.alloc(sz), fd = fs.openSync(fp,'r');
    try { fs.readSync(fd,buf,0,sz,st.size-sz); } finally { fs.closeSync(fd); }
    return buf.toString('utf8').split('\n').filter(l=>l.trim()).slice(-n);
  } catch { return []; }
}

function resolveSources(d: LogsDeps): LogSource[] {
  const ld = path.join(d.OPENCLAW_DIR, 'logs');
  const s: LogSource[] = [
    { id:'gateway', name:'Gateway', description:'OpenClaw gateway stdout logs', type:'plaintext', path:path.join(ld,'gateway.log'), available:false },
    { id:'gateway-errors', name:'Gateway Errors', description:'OpenClaw gateway stderr logs', type:'plaintext', path:path.join(ld,'gateway.err.log'), available:false },
    { id:'access', name:'Access Log', description:'Dashboard auth/access events', type:'jsonl', path:path.join(d.LOG_DIR,'tactical-map-access.log'), available:false },
    { id:'config-audit', name:'Config Audit', description:'Config change audit trail', type:'jsonl', path:path.join(ld,'config-audit.jsonl'), available:false },
    { id:'commands', name:'Commands', description:'Session commands', type:'jsonl', path:path.join(ld,'commands.log'), available:false },
    { id:'session-monitor', name:'Session Monitor', description:'Session health', type:'plaintext', path:path.join(ld,'session-monitor.log'), available:false },
  ];
  for (const x of s) { if (x.path) try { x.available = fs.existsSync(x.path)&&fs.statSync(x.path).size>0; } catch { x.available = false; } }
  return s;
}

function readLogs(src: LogSource, o: { lines:number; level?:string; keyword?:string; since?:number; until?:number }): ParsedLogEntry[] {
  if (!src.path||!src.available) return [];
  const raw = readTail(src.path, o.lines*3);
  const fn = src.type==='jsonl' ? (l:string)=>parseJson(l,src.id) : (l:string)=>parsePlain(l,src.id);
  let e: ParsedLogEntry[] = []; for (const l of raw) { const x = fn(l); if (x) e.push(x); }
  if (o.level&&o.level!=='all') e = e.filter(x=>x.level===o.level);
  if (o.keyword) { const k = o.keyword.toLowerCase(); e = e.filter(x=>x.message.toLowerCase().includes(k)||x.raw.toLowerCase().includes(k)||Object.values(x.meta??{}).some(v=>v.toLowerCase().includes(k))); }
  if (o.since) e = e.filter(x=>{ const t = new Date(x.timestamp).getTime(); return !Number.isNaN(t)&&t>=o.since!; });
  if (o.until) e = e.filter(x=>{ const t = new Date(x.timestamp).getTime(); return !Number.isNaN(t)&&t<=o.until!; });
  return e.slice(-o.lines);
}

export function handleLogs(req: IncomingMessage, res: ServerResponse, deps: LogsDeps): boolean {
  if (!req.url||req.method!=='GET') return false;

  if (req.url==='/api/logs/sources') {
    deps.sendJson(res, { sources: resolveSources(deps).map(s=>({ id:s.id, name:s.name, description:s.description, type:s.type, available:s.available })) });
    return true;
  }

  if (req.url.startsWith('/api/logs/read')) {
    const p = new URL(req.url,'http://localhost').searchParams;
    const sids = (p.get('sources')??'gateway').split(',').map(s=>s.trim());
    const lines = deps.clampInt(p.get('lines'),10,1000,200), level = p.get('level')??'all', keyword = p.get('keyword')??'';
    const sinceStr = p.get('since')??'', untilStr = p.get('until')??'';
    const since = sinceStr ? new Date(sinceStr).getTime() : undefined, until = untilStr ? new Date(untilStr).getTime() : undefined;
    const all = resolveSources(deps).filter(s=>sids.includes(s.id)&&s.available);
    let entries: ParsedLogEntry[] = [];
    for (const s of all) entries = entries.concat(readLogs(s, { lines, level:level!=='all'?level:undefined, keyword:keyword||undefined, since:since&&!Number.isNaN(since)?since:undefined, until:until&&!Number.isNaN(until)?until:undefined }));
    entries.sort((a,b)=>new Date(a.timestamp).getTime()-new Date(b.timestamp).getTime());
    entries = entries.slice(-lines);
    deps.sendJson(res, { entries, count:entries.length, sources:sids, filters:{ level, keyword, since:sinceStr, until:untilStr } });
    return true;
  }

  if (req.url.startsWith('/api/logs/stream')) {
    const p = new URL(req.url,'http://localhost').searchParams;
    const sids = (p.get('sources')??'gateway').split(',').map(s=>s.trim());
    const level = p.get('level')??'all', keyword = (p.get('keyword')??'').toLowerCase();
    res.writeHead(200, { 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache', Connection:'keep-alive' });
    res.write('data: '+JSON.stringify({ type:'connected', sources:sids })+'\n\n');
    const all = resolveSources(deps).filter(s=>sids.includes(s.id)&&s.available);
    const sizes: Record<string,number> = {};
    for (const s of all) { if (s.path) try { sizes[s.id] = fs.statSync(s.path).size; } catch { sizes[s.id] = 0; } }
    const watchers: fs.FSWatcher[] = [];
    for (const s of all) { if (!s.path) continue; try { const w = fs.watch(s.path, (et)=>{
      if (et!=='change') return; try { if (!res.writable) return;
        const st = fs.statSync(s.path!), prev = sizes[s.id]??0; if (st.size<=prev) return;
        const fd = fs.openSync(s.path!,'r'), buf = Buffer.alloc(st.size-prev);
        fs.readSync(fd,buf,0,buf.length,prev); fs.closeSync(fd); sizes[s.id] = st.size;
        const nl = buf.toString('utf8').split('\n').filter(l=>l.trim());
        const fn2 = s.type==='jsonl' ? (l:string)=>parseJson(l,s.id) : (l:string)=>parsePlain(l,s.id);
        for (const l of nl) { const e = fn2(l); if (!e) continue; if (level!=='all'&&e.level!==level) continue;
          if (keyword&&!e.message.toLowerCase().includes(keyword)&&!e.raw.toLowerCase().includes(keyword)) continue;
          res.write('data: '+JSON.stringify({ type:'log', entry:e })+'\n\n'); }
      } catch {} }); watchers.push(w); } catch {} }
    req.on('close', ()=>{ for (const w of watchers) try { w.close(); } catch {} });
    return true;
  }

  if (req.url.startsWith('/api/logs?')||req.url==='/api/logs') {
    const p = new URL(req.url,'http://localhost').searchParams;
    const svc = p.get('service')??'gateway', n = deps.clampInt(p.get('lines'),10,1000,100);
    const map: Record<string,string> = { openclaw:'gateway', 'agent-dashboard':'access', tailscaled:'gateway' };
    const sid = map[svc]??'gateway', src = resolveSources(deps).find(s=>s.id===sid);
    if (!src||!src.available) { res.writeHead(200,{'Content-Type':'text/plain'}); res.end('No logs for: '+sid); return true; }
    res.writeHead(200,{'Content-Type':'text/plain'}); res.end(readTail(src.path!,n).map(l=>redactSecrets(l)).join('\n'));
    return true;
  }

  return false;
}
