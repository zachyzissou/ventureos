/**
 * WebMCP client abstraction (Issue #225)
 *
 * - typed tool discovery from WebMCP-compatible manifests
 * - invocation with schema validation
 * - discovery schema cache
 * - graceful fallback to browser automation
 */

export interface WebMcpToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface WebMcpSiteProfile {
  id: string;
  label: string;
  siteUrl: string;
}

export interface WebMcpDiscoveryResult {
  siteUrl: string;
  tools: WebMcpToolDefinition[];
  adapter: string;
  cached: boolean;
  discoveredAt: string;
}

export interface WebMcpInvokeRequest {
  siteUrl: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface BrowserFallbackResult {
  strategy: 'browser-automation-fallback';
  reason: string;
  siteUrl: string;
  toolName: string;
  actionHint: string;
  payload: Record<string, unknown>;
}

export interface WebMcpInvokeResult {
  ok: boolean;
  source: 'webmcp' | 'fallback';
  siteUrl: string;
  toolName: string;
  result?: unknown;
  error?: string;
  fallback?: BrowserFallbackResult;
}

export interface WebMcpMetrics {
  discovered: number;
  cacheHits: number;
  invoked: number;
  fallbackInvoked: number;
  errors: number;
  updatedAt: string | null;
  perSite: Record<string, { discovered: number; invoked: number; fallbackInvoked: number }>;
}

export interface WebMcpAdapterDiscovery {
  tools: WebMcpToolDefinition[];
  invokeUrl?: string;
}

export interface WebMcpAdapter {
  name: string;
  canHandle(siteUrl: string): boolean;
  discover(siteUrl: string): Promise<WebMcpAdapterDiscovery | null>;
  invoke(siteUrl: string, toolName: string, args: Record<string, unknown>, ctx: { invokeUrl?: string }): Promise<unknown>;
}

export interface WebMcpClientOptions {
  adapters?: WebMcpAdapter[];
  cacheTtlMs?: number;
  now?: () => Date;
  fallbackInvoker?: (input: {
    siteUrl: string;
    toolName: string;
    args: Record<string, unknown>;
    reason: string;
  }) => Promise<BrowserFallbackResult>;
  siteProfiles?: WebMcpSiteProfile[];
}

interface CacheEntry {
  siteUrl: string;
  adapter: string;
  tools: WebMcpToolDefinition[];
  invokeUrl?: string;
  discoveredAt: string;
  expiresAtMs: number;
}

const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;

export const DEFAULT_WEBMCP_SITE_PROFILES: WebMcpSiteProfile[] = [
  {
    id: 'webmcp-spec-site',
    label: 'WebMCP Spec Site',
    siteUrl: 'https://webmachinelearning.github.io/webmcp/',
  },
  {
    id: 'usechar',
    label: 'UseChar',
    siteUrl: 'https://usechar.ai/',
  },
  {
    id: 'mcpb-docs',
    label: 'MCP-B Docs',
    siteUrl: 'https://docs.mcp-b.ai/',
  },
];

function normalizeSiteUrl(siteUrl: string): string {
  const u = new URL(siteUrl);
  return `${u.protocol}//${u.host}`;
}

function nowIso(now: () => Date): string {
  return now().toISOString();
}

function getToolSchema(tool: WebMcpToolDefinition): Record<string, unknown> {
  return (tool.inputSchema && typeof tool.inputSchema === 'object')
    ? tool.inputSchema
    : {};
}

function validateType(value: unknown, type: string): boolean {
  if (type === 'string') return typeof value === 'string';
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return typeof value === 'object' && value != null && !Array.isArray(value);
  return true;
}

function validateArgs(args: Record<string, unknown>, schema: Record<string, unknown>): { ok: boolean; error?: string } {
  const required = Array.isArray(schema.required) ? schema.required.filter((v): v is string => typeof v === 'string') : [];
  const properties = (schema.properties && typeof schema.properties === 'object')
    ? schema.properties as Record<string, { type?: string }>
    : {};

  for (const field of required) {
    if (!(field in args)) return { ok: false, error: `Missing required argument: ${field}` };
  }
  for (const [field, property] of Object.entries(properties)) {
    if (!(field in args)) continue;
    const expectedType = typeof property.type === 'string' ? property.type : '';
    if (expectedType && !validateType(args[field], expectedType)) {
      return {
        ok: false,
        error: `Invalid type for ${field}: expected ${expectedType}`,
      };
    }
  }
  return { ok: true };
}

function normalizeTool(raw: unknown): WebMcpToolDefinition | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  if (!name) return null;

  const inputSchema = (
    (record.inputSchema && typeof record.inputSchema === 'object' && !Array.isArray(record.inputSchema))
      ? record.inputSchema
      : (record.input_schema && typeof record.input_schema === 'object' && !Array.isArray(record.input_schema))
        ? record.input_schema
        : (record.parameters && typeof record.parameters === 'object' && !Array.isArray(record.parameters))
          ? record.parameters
          : {}
  ) as Record<string, unknown>;

  const outputSchema = (
    (record.outputSchema && typeof record.outputSchema === 'object' && !Array.isArray(record.outputSchema))
      ? record.outputSchema
      : (record.output_schema && typeof record.output_schema === 'object' && !Array.isArray(record.output_schema))
        ? record.output_schema
        : undefined
  ) as Record<string, unknown> | undefined;

  return {
    name,
    description: typeof record.description === 'string' ? record.description : undefined,
    inputSchema,
    outputSchema,
  };
}

export class HttpManifestWebMcpAdapter implements WebMcpAdapter {
  readonly name = 'http-manifest';
  private readonly discoveryPaths: string[];
  private readonly defaultInvokePath: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: {
    discoveryPaths?: string[];
    defaultInvokePath?: string;
    fetchFn?: typeof fetch;
  } = {}) {
    this.discoveryPaths = options.discoveryPaths ?? [
      '/.well-known/webmcp.json',
      '/.well-known/webmcp/tools.json',
      '/webmcp.json',
    ];
    this.defaultInvokePath = options.defaultInvokePath ?? '/.well-known/webmcp/invoke';
    this.fetchFn = options.fetchFn ?? fetch;
  }

  canHandle(siteUrl: string): boolean {
    try {
      const u = new URL(siteUrl);
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch {
      return false;
    }
  }

  async discover(siteUrl: string): Promise<WebMcpAdapterDiscovery | null> {
    const base = normalizeSiteUrl(siteUrl);
    for (const pathName of this.discoveryPaths) {
      try {
        const res = await this.fetchFn(`${base}${pathName}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) continue;
        const payload = await res.json() as unknown;
        const parsed = this.parseDiscoveryPayload(payload);
        if (parsed.tools.length === 0) continue;
        return parsed;
      } catch {
        // Try next endpoint.
      }
    }
    return null;
  }

  async invoke(
    siteUrl: string,
    toolName: string,
    args: Record<string, unknown>,
    ctx: { invokeUrl?: string },
  ): Promise<unknown> {
    const base = normalizeSiteUrl(siteUrl);
    const invokeUrl = ctx.invokeUrl ? `${base}${ctx.invokeUrl.startsWith('/') ? '' : '/'}${ctx.invokeUrl}` : `${base}${this.defaultInvokePath}`;
    const res = await this.fetchFn(invokeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        tool: toolName,
        arguments: args,
      }),
    });
    if (!res.ok) {
      throw new Error(`WebMCP invoke failed: ${res.status}`);
    }
    return await res.json() as unknown;
  }

  private parseDiscoveryPayload(payload: unknown): WebMcpAdapterDiscovery {
    const record = (payload && typeof payload === 'object' && !Array.isArray(payload))
      ? payload as Record<string, unknown>
      : {};
    const rawTools = Array.isArray(record.tools)
      ? record.tools
      : Array.isArray(record.capabilities)
        ? record.capabilities
        : [];
    const tools = rawTools
      .map((raw) => normalizeTool(raw))
      .filter((tool): tool is WebMcpToolDefinition => tool != null);
    const invokeUrl = typeof record.invoke_url === 'string'
      ? record.invoke_url
      : typeof record.invokeUrl === 'string'
        ? record.invokeUrl
        : undefined;
    return { tools, invokeUrl };
  }
}

export class WebMcpClient {
  private readonly adapters: WebMcpAdapter[];
  private readonly cache = new Map<string, CacheEntry>();
  private readonly cacheTtlMs: number;
  private readonly now: () => Date;
  private readonly fallbackInvoker: WebMcpClientOptions['fallbackInvoker'];
  private readonly metrics: WebMcpMetrics = {
    discovered: 0,
    cacheHits: 0,
    invoked: 0,
    fallbackInvoked: 0,
    errors: 0,
    updatedAt: null,
    perSite: {},
  };
  private readonly siteProfiles: WebMcpSiteProfile[];

  constructor(options: WebMcpClientOptions = {}) {
    this.adapters = options.adapters ?? [new HttpManifestWebMcpAdapter()];
    this.cacheTtlMs = Math.max(5_000, options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS);
    this.now = options.now ?? (() => new Date());
    this.fallbackInvoker = options.fallbackInvoker ?? (async (input) => ({
      strategy: 'browser-automation-fallback',
      reason: input.reason,
      siteUrl: input.siteUrl,
      toolName: input.toolName,
      actionHint: `Use browser automation for ${input.toolName} on ${input.siteUrl}`,
      payload: input.args,
    }));
    this.siteProfiles = options.siteProfiles ?? DEFAULT_WEBMCP_SITE_PROFILES;
  }

  getSiteProfiles(): WebMcpSiteProfile[] {
    return [...this.siteProfiles];
  }

  getMetrics(): WebMcpMetrics {
    return {
      ...this.metrics,
      perSite: { ...this.metrics.perSite },
    };
  }

  clearCache(): void {
    this.cache.clear();
  }

  async discoverTools(siteUrlRaw: string, opts: { forceRefresh?: boolean } = {}): Promise<WebMcpDiscoveryResult> {
    const siteUrl = normalizeSiteUrl(siteUrlRaw);
    const nowMs = this.now().getTime();
    const cached = this.cache.get(siteUrl);
    if (!opts.forceRefresh && cached && cached.expiresAtMs > nowMs) {
      this.metrics.cacheHits += 1;
      this.bumpSiteMetric(siteUrl, 'discovered');
      this.touchMetrics();
      return {
        siteUrl,
        tools: cached.tools,
        adapter: cached.adapter,
        cached: true,
        discoveredAt: cached.discoveredAt,
      };
    }

    for (const adapter of this.adapters) {
      if (!adapter.canHandle(siteUrl)) continue;
      try {
        const discovery = await adapter.discover(siteUrl);
        if (!discovery || discovery.tools.length === 0) continue;
        const discoveredAt = nowIso(this.now);
        const entry: CacheEntry = {
          siteUrl,
          adapter: adapter.name,
          tools: discovery.tools,
          invokeUrl: discovery.invokeUrl,
          discoveredAt,
          expiresAtMs: this.now().getTime() + this.cacheTtlMs,
        };
        this.cache.set(siteUrl, entry);
        this.metrics.discovered += 1;
        this.bumpSiteMetric(siteUrl, 'discovered');
        this.touchMetrics();
        return {
          siteUrl,
          tools: discovery.tools,
          adapter: adapter.name,
          cached: false,
          discoveredAt,
        };
      } catch {
        this.metrics.errors += 1;
      }
    }

    this.touchMetrics();
    return {
      siteUrl,
      tools: [],
      adapter: 'none',
      cached: false,
      discoveredAt: nowIso(this.now),
    };
  }

  async invokeTool(input: WebMcpInvokeRequest): Promise<WebMcpInvokeResult> {
    const siteUrl = normalizeSiteUrl(input.siteUrl);
    this.metrics.invoked += 1;
    this.bumpSiteMetric(siteUrl, 'invoked');

    const discovery = await this.discoverTools(siteUrl);
    const tool = discovery.tools.find((item) => item.name === input.toolName);
    if (!tool) {
      return this.invokeFallback(siteUrl, input.toolName, input.args, 'tool_not_found_or_webmcp_unavailable');
    }

    const validation = validateArgs(input.args, getToolSchema(tool));
    if (!validation.ok) {
      this.metrics.errors += 1;
      this.touchMetrics();
      return {
        ok: false,
        source: 'webmcp',
        siteUrl,
        toolName: input.toolName,
        error: validation.error ?? 'schema_validation_failed',
      };
    }

    const cacheEntry = this.cache.get(siteUrl);
    const adapter = this.adapters.find((item) => item.name === (cacheEntry?.adapter ?? discovery.adapter));
    if (!adapter) {
      return this.invokeFallback(siteUrl, input.toolName, input.args, 'adapter_unavailable');
    }

    try {
      const result = await adapter.invoke(siteUrl, input.toolName, input.args, {
        invokeUrl: cacheEntry?.invokeUrl,
      });
      this.touchMetrics();
      return {
        ok: true,
        source: 'webmcp',
        siteUrl,
        toolName: input.toolName,
        result,
      };
    } catch {
      this.metrics.errors += 1;
      return this.invokeFallback(siteUrl, input.toolName, input.args, 'invoke_error');
    }
  }

  private async invokeFallback(
    siteUrl: string,
    toolName: string,
    args: Record<string, unknown>,
    reason: string,
  ): Promise<WebMcpInvokeResult> {
    this.metrics.fallbackInvoked += 1;
    this.bumpSiteMetric(siteUrl, 'fallbackInvoked');
    this.touchMetrics();
    const fallback = await this.fallbackInvoker?.({ siteUrl, toolName, args, reason });
    return {
      ok: true,
      source: 'fallback',
      siteUrl,
      toolName,
      fallback,
      result: fallback,
    };
  }

  private bumpSiteMetric(siteUrl: string, key: 'discovered' | 'invoked' | 'fallbackInvoked'): void {
    const current = this.metrics.perSite[siteUrl] ?? { discovered: 0, invoked: 0, fallbackInvoked: 0 };
    current[key] += 1;
    this.metrics.perSite[siteUrl] = current;
  }

  private touchMetrics(): void {
    this.metrics.updatedAt = nowIso(this.now);
  }
}

let defaultWebMcpClient: WebMcpClient | null = null;

export function getDefaultWebMcpClient(): WebMcpClient {
  if (!defaultWebMcpClient) defaultWebMcpClient = new WebMcpClient();
  return defaultWebMcpClient;
}

export function resetDefaultWebMcpClient(): void {
  defaultWebMcpClient = null;
}

