/**
 * KPI Registry - Canonical metric definitions bridging human language ↔ machine formulas
 * 
 * Provides a unified interface to load, compute, and explain KPIs across all agents.
 * Each KPI connects to real data sources (RPG database, observational memory) and
 * provides both machine-readable formulas and human-readable explanations.
 */

import { promises as fs } from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

// ============================================================================
// SQL Injection Prevention Helpers (VULN-002)
// ============================================================================

/**
 * Strict YYYY-MM-DD validation.
 *
 * - Rejects timestamps and other ISO-8601 variants
 * - Rejects URL-encoded payloads
 * - Validates calendar correctness (e.g., 2026-02-30 is invalid)
 */
export function isValidDateString(date: string): boolean {
  if (typeof date !== 'string') return false;

  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(date);
  if (!m) return false;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  // Validate actual calendar date (UTC-safe)
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year) return false;
  if (d.getUTCMonth() !== month - 1) return false;
  if (d.getUTCDate() !== day) return false;

  return true;
}

export function isValidSqlIdentifier(name: string): boolean {
  if (typeof name !== 'string') return false;
  // SQLite identifiers: keep to a conservative subset.
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

/**
 * Validates a single, safe SELECT field expression.
 *
 * Intentionally rejects comma-separated lists. Use a dedicated list validator
 * when selecting multiple columns.
 */
export function isValidFieldExpression(expr: string): boolean {
  if (typeof expr !== 'string') return false;
  const s = expr.trim();
  if (!s) return false;
  if (s.includes(',')) return false;

  // Allow plain identifiers (e.g., mttr_minutes)
  if (isValidSqlIdentifier(s)) return true;

  // Allow a restricted set of aggregate expressions with AS alias.
  // Examples: COUNT(*) AS total, AVG(duration_ms) AS latency_ms
  const agg = /^(COUNT|AVG|SUM|MIN|MAX)\(\s*(\*|(DISTINCT\s+)?[A-Za-z_][A-Za-z0-9_]*)\s*\)\s+AS\s+([A-Za-z_][A-Za-z0-9_]*)$/i;
  return agg.test(s);
}

function validateDateString(date: string): void {
  // NOTE: tests assert this exact callsite string exists in the source.
  if (!isValidDateString(date)) {
    // NOTE: tests assert this substring exists.
    throw new Error('Invalid date format (expected YYYY-MM-DD)');
  }
}

function isSafeSqlFragment(fragment: string): boolean {
  // Disallow obvious injection primitives.
  // This is a best-effort guard for config-sourced fragments.
  return !/[;\u0000]/.test(fragment) && !/--/.test(fragment) && !/\/\*/.test(fragment);
}

function parseSelectFields(field: string): { sql: string } {
  const raw = field.trim();
  if (!raw) return { sql: '*' };

  // Support selecting multiple columns (comma-separated) *only* as identifiers.
  if (raw.includes(',')) {
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) throw new Error(`Invalid field list: ${field}`);
    for (const p of parts) {
      if (!isValidSqlIdentifier(p)) throw new Error(`Invalid column name: ${p}`);
    }
    return { sql: parts.join(', ') };
  }

  if (isValidFieldExpression(raw)) return { sql: raw };

  throw new Error(`Invalid field expression: ${field}`);
}

function parseFilter(filter: string, params: any[]): { sql: string } {
  const raw = filter.trim();
  if (!raw) throw new Error('Invalid filter');
  if (!isSafeSqlFragment(raw)) throw new Error('Invalid filter fragment');

  // Support a conservative subset used by our KPI fixtures:
  //   event_type = 'x'
  //   event_type LIKE 'x%'
  const mEq = /^event_type\s*=\s*'([^']*)'$/.exec(raw);
  if (mEq) {
    params.push(mEq[1]);
    return { sql: 'event_type = ?' };
  }

  const mLike = /^event_type\s+LIKE\s+'([^']*)'$/.exec(raw);
  if (mLike) {
    params.push(mLike[1]);
    return { sql: 'event_type LIKE ?' };
  }

  // Fallback: allow only extremely simple, safe fragments.
  // (Prefer adding new structured patterns above if KPI configs evolve.)
  if (/^[A-Za-z0-9_\s=()%<>'".]+$/.test(raw)) {
    return { sql: raw };
  }

  throw new Error('Unsupported filter syntax');
}

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface Formula {
  type: 'ratio' | 'count' | 'percentage' | 'average' | 'threshold' | 'custom';
  numerator?: string;
  denominator?: string;
  field?: string;
  scale?: number;
  aggregation?: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'distinct_count';
  custom_function?: string;
}

export interface DataSource {
  table: string;
  field?: string;
  filter?: string;
  join?: string;
}

export interface Thresholds {
  excellent: number;
  good: number;
  acceptable: number;
  poor: number;
  direction?: 'higher_is_better' | 'lower_is_better';
}

export interface Visualization {
  dashboard_section: string;
  chart_type: 'line' | 'bar' | 'gauge' | 'sparkline' | 'number';
  update_frequency: 'realtime' | 'hourly' | 'daily' | 'weekly';
  color_scheme?: string;
}

export interface AuditTrail {
  created: string;
  last_modified: string;
  change_log: Array<{
    date: string;
    description: string;
    modified_by?: string;
  }>;
}

export interface KPIDefinition {
  kpi_id: string;
  agent_id: string;
  category: string;
  name: string;
  description: string;
  stakeholder_description: string;
  formula: Formula;
  data_sources: DataSource[];
  thresholds: Thresholds;
  visualization: Visualization;
  audit_trail: AuditTrail;
}

export interface KPI {
  kpi_id: string;
  definition: KPIDefinition;
  compute: (date?: string, db?: Database.Database) => Promise<number>;
  explain: (currentValue?: number) => string;
}

export interface KPIComputationResult {
  kpi_id: string;
  value: number;
  date: string;
  threshold_level: 'excellent' | 'good' | 'acceptable' | 'poor' | 'critical';
  metadata: {
    formula_type: string;
    data_sources: string[];
    computed_at: string;
  };
}

// ============================================================================
// Configuration
// ============================================================================

const KPI_DIR = path.resolve(process.env.HOME!, 'clawd/agents/kpis');
const DB_PATH = path.resolve(process.env.HOME!, 'clawd/agents/ventureos-rpg.db');

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Load a single KPI definition from disk
 */
export async function loadKPIDefinition(kpi_id: string): Promise<KPIDefinition> {
  const filePath = path.join(KPI_DIR, `${kpi_id}.json`);
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const definition = JSON.parse(content) as KPIDefinition;
    
    // Validate that the file name matches the kpi_id
    if (definition.kpi_id !== kpi_id) {
      throw new Error(
        `KPI ID mismatch: file name ${kpi_id}.json contains kpi_id ${definition.kpi_id}`
      );
    }
    
    return definition;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(`KPI definition not found: ${kpi_id}`);
    }
    throw error;
  }
}

/**
 * Load all KPI definitions from disk
 */
export async function loadAllKPIDefinitions(): Promise<Map<string, KPIDefinition>> {
  const files = await fs.readdir(KPI_DIR);
  const kpiFiles = files.filter(f => f.endsWith('.json') && f !== 'schema.json');
  
  const definitions = new Map<string, KPIDefinition>();
  
  for (const file of kpiFiles) {
    const kpi_id = file.replace('.json', '');
    try {
      const definition = await loadKPIDefinition(kpi_id);
      definitions.set(kpi_id, definition);
    } catch (error) {
      console.warn(`Failed to load KPI ${kpi_id}:`, error);
    }
  }
  
  return definitions;
}

/**
 * Create a KPI instance with compute and explain methods
 */
export async function loadKPI(kpi_id: string): Promise<KPI> {
  const definition = await loadKPIDefinition(kpi_id);
  
  return {
    kpi_id,
    definition,
    compute: async (date?: string, db?: Database.Database) => {
      return computeKPI(kpi_id, date, db);
    },
    explain: (currentValue?: number) => {
      return explainKPI(kpi_id, definition, currentValue);
    }
  };
}

/**
 * Load all KPIs as a map
 */
export async function loadAllKPIs(): Promise<Map<string, KPI>> {
  const definitions = await loadAllKPIDefinitions();
  const kpis = new Map<string, KPI>();
  
  for (const [kpi_id, definition] of definitions.entries()) {
    kpis.set(kpi_id, {
      kpi_id,
      definition,
      compute: async (date?: string, db?: Database.Database) => {
        return computeKPI(kpi_id, date, db);
      },
      explain: (currentValue?: number) => {
        return explainKPI(kpi_id, definition, currentValue);
      }
    });
  }
  
  return kpis;
}

// ============================================================================
// Computation Engine
// ============================================================================

/**
 * Compute a KPI value for a given date
 */
export async function computeKPI(
  kpi_id: string,
  date?: string,
  dbInstance?: Database.Database
): Promise<number> {
  const definition = await loadKPIDefinition(kpi_id);
  const targetDate = date || new Date().toISOString().split('T')[0];
  
  // Open database connection (use provided instance or create new one)
  const db = dbInstance || new Database(DB_PATH, { readonly: true });
  
  try {
    // Fetch data from all sources
    const data = await fetchDataSources(definition.data_sources, targetDate, db);
    
    // Compute based on formula type
    const value = computeFormulaValue(definition.formula, data);
    
    return value;
  } finally {
    // Only close if we created the connection
    if (!dbInstance) {
      db.close();
    }
  }
}

/**
 * Fetch data from all configured data sources
 */
async function fetchDataSources(
  sources: DataSource[],
  date: string,
  db: Database.Database
): Promise<Record<string, any>> {
  const data: Record<string, any> = {};

  for (const source of sources) {
    try {
      const { sql, params } = buildQuery(source, date);
      const result = db.prepare(sql).get(...params);

      // Merge result into data object
      if (result) {
        Object.assign(data, result);
      }
    } catch (error) {
      console.warn(`Failed to fetch from ${source.table}:`, error);
      // Continue with other sources
    }
  }

  return data;
}

// Restrict KPI query builder to known-safe tables.
export const ALLOWED_TABLES = new Set<string>([
  'psionic_stats',
  'interaction_logs',
]);

/**
 * Build SQL query from data source configuration.
 *
 * Returns SQL + params for a prepared statement.
 */
function buildQuery(source: DataSource, date: string): { sql: string; params: any[] } {
  validateDateString(date);

  if (!ALLOWED_TABLES.has(source.table)) {
    throw new Error(`Disallowed table: ${source.table}`);
  }

  if (!isValidSqlIdentifier(source.table)) {
    throw new Error(`Invalid table name: ${source.table}`);
  }

  const params: any[] = [];

  const select = source.field ? parseSelectFields(source.field).sql : '*';

  let sql = 'SELECT ' + select + ' FROM ' + source.table;

  if (source.join) {
    // Joins are not currently used by our KPI fixtures; keep conservative.
    if (!isSafeSqlFragment(source.join)) throw new Error('Invalid join fragment');
    sql += ' ' + source.join.trim();
  }

  // Build WHERE clause
  const where: string[] = [];

  if (source.filter) {
    const parsed = parseFilter(source.filter, params);
    where.push('(' + parsed.sql + ')');
  }

  // Add date filter for tables with snapshot_date or created_at
  if (source.table === 'psionic_stats') {
    where.push('snapshot_date = ?');
    params.push(date);
  } else if (source.table === 'interaction_logs') {
    where.push('DATE(created_at) = ?');
    params.push(date);
  }

  if (where.length > 0) {
    sql += ' WHERE ' + where.join(' AND ');
  }

  return { sql, params };
}

/**
 * Compute the final value based on formula type
 */
function computeFormulaValue(formula: Formula, data: Record<string, any>): number {
  switch (formula.type) {
    case 'ratio':
    case 'percentage': {
      const numerator = data[formula.numerator!] || 0;
      const denominator = data[formula.denominator!] || 1; // Avoid division by zero
      const scale = formula.scale || 1;
      return (numerator / denominator) * scale;
    }
    
    case 'count': {
      return data[formula.field!] || 0;
    }
    
    case 'average': {
      // If aggregation already done in SQL, use that
      if (data[formula.field!] !== undefined) {
        return data[formula.field!];
      }
      // Otherwise compute from array (future enhancement)
      return 0;
    }
    
    case 'threshold': {
      const value = data[formula.field!] || 0;
      // Threshold type returns the raw value
      return value;
    }
    
    case 'custom': {
      // Custom functions would be imported and called here
      // For now, return 0 as placeholder
      console.warn('Custom formula functions not yet implemented');
      return 0;
    }
    
    default:
      throw new Error(`Unknown formula type: ${(formula as any).type}`);
  }
}

// ============================================================================
// Explanation & Interpretation
// ============================================================================

/**
 * Generate human-readable explanation of a KPI
 */
export function explainKPI(
  kpi_id: string,
  definition: KPIDefinition,
  currentValue?: number
): string {
  const parts: string[] = [];
  
  // Basic description
  parts.push(`**${definition.name}** (${kpi_id})`);
  parts.push(`\n${definition.stakeholder_description}`);
  
  // Formula explanation
  parts.push(`\n\n**How it's calculated:**`);
  parts.push(explainFormula(definition.formula));
  
  // Current value and threshold (if provided)
  if (currentValue !== undefined) {
    const level = determineThresholdLevel(currentValue, definition.thresholds);
    const emoji = getThresholdEmoji(level);
    
    parts.push(`\n\n**Current value:** ${formatValue(currentValue, definition.formula)} ${emoji}`);
    parts.push(`**Performance level:** ${level}`);
  }
  
  // Thresholds
  parts.push(`\n\n**Thresholds:**`);
  parts.push(`- Excellent: ${formatValue(definition.thresholds.excellent, definition.formula, true)}`);
  parts.push(`- Good: ${formatValue(definition.thresholds.good, definition.formula, true)}`);
  parts.push(`- Acceptable: ${formatValue(definition.thresholds.acceptable, definition.formula, true)}`);
  parts.push(`- Poor: ${formatValue(definition.thresholds.poor, definition.formula, true)}`);
  
  return parts.join('\n');
}

/**
 * Explain how a formula works
 */
function explainFormula(formula: Formula): string {
  switch (formula.type) {
    case 'ratio':
      return `${formula.numerator} ÷ ${formula.denominator}${formula.scale !== 1 ? ` × ${formula.scale}` : ''}`;
    
    case 'percentage':
      return `(${formula.numerator} ÷ ${formula.denominator}) × 100`;
    
    case 'count':
      return `Count of ${formula.field}`;
    
    case 'average':
      return `Average of ${formula.field} (${formula.aggregation || 'mean'})`;
    
    case 'threshold':
      return `Value of ${formula.field}`;
    
    case 'custom':
      return `Custom function: ${formula.custom_function || 'unknown'}`;
    
    default:
      return 'Unknown formula type';
  }
}

/**
 * Format a value based on formula type
 */
function formatValue(value: number, formula: Formula, isThreshold: boolean = false): string {
  // For ratio/percentage formulas with scale=100, format as percentage
  if ((formula.type === 'ratio' || formula.type === 'percentage') && formula.scale === 100) {
    // Threshold values are already in 0-1 range, need to convert to percentage
    const percentValue = isThreshold ? value * 100 : value;
    return `${percentValue.toFixed(1)}%`;
  }
  
  // Round to 2 decimal places for most metrics
  return value.toFixed(2);
}

/**
 * Determine threshold level for a given value
 */
export function determineThresholdLevel(
  value: number,
  thresholds: Thresholds
): 'excellent' | 'good' | 'acceptable' | 'poor' | 'critical' {
  const direction = thresholds.direction || 'higher_is_better';
  
  if (direction === 'higher_is_better') {
    if (value >= thresholds.excellent) return 'excellent';
    if (value >= thresholds.good) return 'good';
    if (value >= thresholds.acceptable) return 'acceptable';
    if (value >= thresholds.poor) return 'poor';
    return 'critical';
  } else {
    // lower_is_better
    if (value <= thresholds.excellent) return 'excellent';
    if (value <= thresholds.good) return 'good';
    if (value <= thresholds.acceptable) return 'acceptable';
    if (value <= thresholds.poor) return 'poor';
    return 'critical';
  }
}

/**
 * Get emoji for threshold level
 */
function getThresholdEmoji(level: string): string {
  const emojiMap: Record<string, string> = {
    excellent: '🟢',
    good: '🟡',
    acceptable: '🟠',
    poor: '🔴',
    critical: '🚨'
  };
  return emojiMap[level] || '';
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Compute all KPIs for a given agent and date
 */
export async function computeAgentKPIs(
  agent_id: string,
  date?: string
): Promise<Map<string, KPIComputationResult>> {
  const definitions = await loadAllKPIDefinitions();
  const agentKPIs = Array.from(definitions.values()).filter(
    def => def.agent_id === agent_id
  );
  
  const results = new Map<string, KPIComputationResult>();
  const targetDate = date || new Date().toISOString().split('T')[0];
  
  // Open single database connection for all computations
  const db = new Database(DB_PATH, { readonly: true });
  
  try {
    for (const definition of agentKPIs) {
      try {
        const value = await computeKPI(definition.kpi_id, targetDate, db);
        const level = determineThresholdLevel(value, definition.thresholds);
        
        results.set(definition.kpi_id, {
          kpi_id: definition.kpi_id,
          value,
          date: targetDate,
          threshold_level: level,
          metadata: {
            formula_type: definition.formula.type,
            data_sources: definition.data_sources.map(ds => ds.table),
            computed_at: new Date().toISOString()
          }
        });
      } catch (error) {
        console.warn(`Failed to compute ${definition.kpi_id}:`, error);
      }
    }
  } finally {
    db.close();
  }
  
  return results;
}

/**
 * Get KPIs by category
 */
export async function getKPIsByCategory(category: string): Promise<KPIDefinition[]> {
  const definitions = await loadAllKPIDefinitions();
  return Array.from(definitions.values()).filter(def => def.category === category);
}

/**
 * Get all agent IDs that have KPIs defined
 */
export async function getAgentsWithKPIs(): Promise<string[]> {
  const definitions = await loadAllKPIDefinitions();
  const agents = new Set<string>();
  
  for (const def of definitions.values()) {
    agents.add(def.agent_id);
  }
  
  return Array.from(agents).sort();
}

// ============================================================================
// Exports
// ============================================================================

export default {
  loadKPI,
  loadKPIDefinition,
  loadAllKPIs,
  loadAllKPIDefinitions,
  computeKPI,
  explainKPI,
  computeAgentKPIs,
  getKPIsByCategory,
  getAgentsWithKPIs,
  determineThresholdLevel
};
