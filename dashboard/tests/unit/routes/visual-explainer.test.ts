import { describe, expect, it } from 'vitest';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import { handleVisualExplainer } from '../../../server/routes/visual-explainer.js';

const deps = (body: unknown = {}) => ({
  sendJson: (res: ReturnType<typeof mockResponse>, data: unknown, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  },
  readRequestBody: async () => JSON.stringify(body),
});

describe('visual-explainer routes', () => {
  it('returns pattern catalog', async () => {
    const req = mockRequest({ method: 'GET', url: '/api/visual-explainer/patterns' });
    const res = mockResponse();
    const handled = await handleVisualExplainer(req, res, deps());
    expect(handled).toBe(true);
    const body = parseJsonBody<{ patterns: string[] }>(res);
    expect(body.patterns).toHaveLength(5);
  });

  it('renders command output', async () => {
    const req = mockRequest({ method: 'POST', url: '/api/visual-explainer/render' });
    const res = mockResponse();
    await handleVisualExplainer(req, res, deps({
      command: '/visualize a > b > c --pattern=timeline',
    }));
    expect(res._statusCode).toBe(200);
    const body = parseJsonBody<{ ok: boolean; render: { html: string; renderTimeMs: number } }>(res);
    expect(body.ok).toBe(true);
    expect(body.render.html).toContain('<html>');
    expect(body.render.renderTimeMs).toBeLessThan(3000);
  });

  it('validates missing command', async () => {
    const req = mockRequest({ method: 'POST', url: '/api/visual-explainer/render' });
    const res = mockResponse();
    await handleVisualExplainer(req, res, deps({ title: 'missing command' }));
    expect(res._statusCode).toBe(400);
  });
});

