import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { isPathInsideRoot } from './path-containment.js';

function contentTypeFor(filePath: string): string {
  const ext: string = path.extname(filePath).toLowerCase();
  if (ext === '.js' || ext === '.mjs') return 'text/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

export function tryServeStatic(
  req: IncomingMessage,
  res: ServerResponse,
  opts: { urlPrefix: string; rootDir: string },
): boolean {
  try {
    if (!req.url || req.method !== 'GET') return false;
    if (!req.url.startsWith(opts.urlPrefix)) return false;

    const rel: string = decodeURIComponent(req.url.slice(opts.urlPrefix.length)).replace(/^\/+/, '');
    const root: string = path.resolve(opts.rootDir);
    let fpath: string = path.resolve(path.join(root, rel));

    if (!isPathInsideRoot(root, fpath)) {
      res.writeHead(403);
      res.end('Forbidden');
      return true;
    }

    // Auto-serve index.html for directory requests.
    if (fs.existsSync(fpath) && fs.statSync(fpath).isDirectory()) {
      fpath = path.join(fpath, 'index.html');
    }

    if (!fs.existsSync(fpath) || !fs.statSync(fpath).isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return true;
    }

    res.writeHead(200, {
      'Content-Type': contentTypeFor(fpath),
      'Cache-Control': 'no-cache',
    });
    res.end(fs.readFileSync(fpath));
    return true;
  } catch {
    res.writeHead(500);
    res.end('Static file error');
    return true;
  }
}
