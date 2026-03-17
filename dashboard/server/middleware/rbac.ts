/**
 * Canonical RBAC enforcement for privileged dashboard routes.
 *
 * Auth remains the token/cookie boundary. This middleware maps privileged
 * route classes to the shared VentureOS policy gate using canonical subject
 * metadata supplied in request headers.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

import { runResourcePolicyGate, type PolicyResourceClass } from '../../../lib/policy-gate.js';
import { getRequestSubject, logAuthEvent } from './auth.js';

interface RoutePolicyRequirement {
  resourceClass: PolicyResourceClass;
  resourceId: string;
}

function parseUrl(req: IncomingMessage): URL | null {
  try {
    return new URL(req.url ?? '/', 'http://localhost');
  } catch {
    return null;
  }
}

function classifyPrivilegedRoute(req: IncomingMessage): RoutePolicyRequirement | null {
  const method = String(req.method ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null;

  const parsed = parseUrl(req);
  const pathname = parsed?.pathname ?? '';
  if (!pathname.startsWith('/api/')) return null;
  if (pathname === '/api/login' || pathname === '/api/logout' || pathname === '/api/health') return null;

  if (pathname.startsWith('/api/action/')) {
    return { resourceClass: 'dashboard_control', resourceId: pathname };
  }
  if (pathname.startsWith('/api/task-board')) {
    return { resourceClass: 'task_queue_mutation', resourceId: pathname };
  }
  if (pathname.startsWith('/api/proposal-lifecycle')) {
    return { resourceClass: 'task_queue_mutation', resourceId: pathname };
  }
  if (pathname.startsWith('/api/tactical-map/') || pathname.startsWith('/api/replay/')) {
    return { resourceClass: 'dashboard_control', resourceId: pathname };
  }
  if (
    pathname === '/api/token-compaction/run'
    || pathname.startsWith('/api/self-improvement/')
    || pathname.startsWith('/api/code-factory/')
    || pathname.startsWith('/api/webmcp/')
    || pathname === '/api/visual-explainer/render'
    || pathname.startsWith('/api/living-files')
    || pathname.startsWith('/api/shared-context')
    || pathname.startsWith('/api/cron/')
    || pathname === '/api/overview-freshness-event'
    || pathname === '/api/claude-usage-scrape'
    || pathname.startsWith('/api/incident-report')
  ) {
    return { resourceClass: 'dashboard_control', resourceId: pathname };
  }

  return null;
}

export function authorizeDashboardRbac(req: IncomingMessage, res: ServerResponse): boolean {
  const requirement = classifyPrivilegedRoute(req);
  if (!requirement) return true;

  const subject = getRequestSubject(req);
  if (!subject?.actor?.bindingId && !subject?.actor?.capabilityId) {
    logAuthEvent('rbac_denied', req, `Missing canonical subject headers for ${requirement.resourceId}`);
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: false,
      error: 'Privileged dashboard routes require canonical VentureOS subject headers from a trusted local or proxy boundary',
      requiredHeadersAnyOf: [
        'x-ventureos-binding-id',
        'x-ventureos-capability-id',
      ],
      optionalHeaders: [
        'x-ventureos-specialist-id',
      ],
    }));
    return false;
  }

  const decision = runResourcePolicyGate({
    resourceClass: requirement.resourceClass,
    resourceId: requirement.resourceId,
    actor: subject.actor,
  });
  if (decision.ok) return true;

  logAuthEvent(
    'rbac_denied',
    req,
    `${decision.resourceClass}:${decision.resourceId}:${decision.message}`,
  );
  res.writeHead(decision.code === 'INVALID_INPUT' ? 400 : 403, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    ok: false,
    error: decision.message,
    code: decision.code,
    resourceClass: decision.resourceClass,
    actor: decision.actor,
  }));
  return false;
}
