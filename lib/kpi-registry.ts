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
import { KPI_DIR as PATHS_KPI_DIR, RPG_DB_PATH as PATHS_RPG_DB_PATH } from './paths';

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

const KPI_DIR = PATHS_KPI_DIR;
const DB_PATH = PATHS_RPG_DB_PATH;

/**
 * VULN-002: table allowlist for KPI query builder.
 *
 * NOTE: Identifiers cannot be parameterized in SQLite prepared statements.
 * The safest pattern is: validate identifiers + restrict to an allowlist.
 */
export const ALLOWED_TABLES = new Set<string>([
  'performance_stats',
  'interaction_logs',
]);

// ============================================================================
// Security Validation Helpers (VULN-002)
// ============================================================================

/**
 * Strict YYYY-MM-DD validation.
 * - rejects timestamps
 * - rejects encoded payloads and SQL metacharacters
 */
export function isValidDateString(date: string): boolean {
  if (typeof date !== 'string') return false;
  // Fast-path format check
  const m = /^\d{4}-\d{2}-\d{2}$/.exec(date);
  if (!m) return false;

  // Range + calendar validation
  const [yyyy, mm, dd] = date.split('-').map((x) => Number(x));
  if (!Number.isFinite(yyyy) || !Number.isFinite(mm) || !Number.isFinite(dd)) return false;
  if (mm < 1 || mm > 12) return false;
  if (dd < 1 || dd > 31) return false;

  // Ensure it round-trips to the same date in UTC
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (
    d.getUTCFullYear() !== yyyy ||
    d.getUTCMonth() !== mm - 1 ||
    d.getUTCDate() !== dd
  ) {
    return false;
  }

  return true;
}

/**
 * Validates a safe SQL identifier: letters/numbers/underscore, not starting with a number.
 */
export function isValidSqlIdentifier(name: string): boolean {
  if (typeof name !== 'string') return false;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

/**
 * Validates a very small, explicitly supported subset of field expressions.
 * This intentionally DOES NOT allow comma-separated field lists.
 */
export function isValidFieldExpression(expr: string): boolean {
  if (typeof expr !== 'string') return false;
  const s = expr.trim();
  if (!s) return false;

  // Reject obvious dangerous metacharacters early
  if (/[;\n\r]/.test(s)) return false;
  if (/--|\/\*|\*\//.test(s)) return false;

  // Supported: AGG(col|*) AS alias
  // Examples:
  // - COUNT(*) AS total
  // - AVG(duration_ms) AS latency_ms
  const re = /^(COUNT|AVG|SUM|MIN|MAX)\(\s*(\*|[A-Za-z_][A-Za-z0-9_]*)\s*\)\s+AS\s+([A-Za-z_][A-Za-z0-9_]*)$/i;
  const m = re.exec(s);
  if (!m) return false;

  const col = m[2];
  const alias = m[3];
  if (col !== '*' && !isValidSqlIdentifier(col)) return false;
  if (!isValidSqlIdentifier(alias)) return false;

  return true;
}

/**
 * Backwards-compat / explicit validators (some suites expect these names).
 */
export function validateDateFormat(date: string): void {
  if (!isValidDateString(date)) {
    throw new Error('Invalid date format: expected YYYY-MM-DD');
  }
}

export function validateTableName(table: string): void {
  if (!isValidSqlIdentifier(table)) {
    throw new Error('Invalid table name');
  }
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error('Table not allowed');
  }
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Load a single KPI definition from disk
 */
export async function loadKPIDefinition(kpi_id: string): Promise<KPIDefinition> {
  const filePath = path.join(KPI_DIR, kpi_id + '.json');

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const definition = JSON.parse(content) as KPIDefinition;

    // Validate that the file name matches the kpi_id
    if (definition.kpi_id !== kpi_id) {
      throw new Error(
        'KPI ID mismatch: file name ' + kpi_id + '.json contains kpi_id ' + definition.kpi_id
      );
    }

    return definition;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error('KPI definition not found: ' + kpi_id);
    }
    throw error;
  }
}

/**
 * Load all KPI definitions from disk
 */
export async function loadAllKPIDefinitions(): Promise<Map<string, KPIDefinition>> {
  const files = await fs.readdir(KPI_DIR);
  const kpiFiles = files.filter((f) => f.endsWith('.json') && f !== 'schema.json');

  const definitions = new Map<string, KPIDefinition>();

  for (const file of kpiFiles) {
    const kpi_id = file.replace('.json', '');
    try {
      const definition = await loadKPIDefinition(kpi_id);
      definitions.set(kpi_id, definition);
    } catch (error) {
      console.warn('Failed to load KPI ' + kpi_id + ':', error);
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
    },
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
      },
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
      console.warn('Failed to fetch from ' + source.table + ':', error);
      // Continue with other sources
    }
  }

  return data;
}

type BuiltQuery = { sql: string; params: Array<string | number | null> };

function buildSelectClause(field: string): string {
  const trimmed = field.trim();
  if (!trimmed) {
    throw new Error('Invalid field: empty');
  }

  // Support a strict comma-separated list of identifiers (no expressions).
  if (trimmed.includes(',')) {
    const parts = trimmed
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    if (parts.length === 0) {
      throw new Error('Invalid field list');
    }

    for (const p of parts) {
      if (!isValidSqlIdentifier(p)) {
        throw new Error('Invalid field name: ' + p);
      }
    }

    return parts.join(', ');
  }

  if (trimmed === '*') return '*';
  if (isValidSqlIdentifier(trimmed)) return trimmed;
  if (isValidFieldExpression(trimmed)) return trimmed;

  throw new Error('Invalid field expression');
}

function buildFilterClause(filter: string): { clause: string; params: Array<string | number> } {
  const s = filter.trim();
  if (!s) throw new Error('Invalid filter: empty');

  // Supported:
  // - event_type = 'deploy_success'
  // - event_type LIKE 'deploy_%'
  const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*(=|LIKE)\s*'([^']*)'$/.exec(s);
  if (m) {
    const ident = m[1];
    const op = m[2].toUpperCase();
    const value = m[3];

    if (!isValidSqlIdentifier(ident)) {
      throw new Error('Invalid filter identifier');
    }

    // Parameterize the literal value to avoid interpolation.
    return { clause: ident + ' ' + op + ' ?', params: [value] };
  }

  // Supported numeric predicate: ident = 123 (unused today, but safe)
  const n = /^([A-Za-z_][A-Za-z0-9_]*)\s*(=|!=|<>|<=|>=|<|>)\s*(\d+(?:\.\d+)?)$/.exec(s);
  if (n) {
    const ident = n[1];
    const op = n[2];
    const value = Number(n[3]);
    if (!isValidSqlIdentifier(ident)) {
      throw new Error('Invalid filter identifier');
    }
    if (!Number.isFinite(value)) {
      throw new Error('Invalid numeric filter');
    }
    return { clause: ident + ' ' + op + ' ?', params: [value] };
  }

  throw new Error('Invalid filter expression');
}

/**
 * Build SQL query from data source configuration.
 *
 * VULN-002: Date predicates must be parameterized.
 */
function buildQuery(source: DataSource, date: string): BuiltQuery {
  if (!isValidDateString(date)) {
    // test suite asserts this specific substring exists
    throw new Error('Invalid date format');
  }

  // Disallow joins unless explicitly supported & validated.
  if (source.join) {
    throw new Error('JOIN not supported in KPI query builder');
  }

  if (!isValidSqlIdentifier(source.table)) {
    throw new Error('Invalid table name');
  }

  if (!ALLOWED_TABLES.has(source.table)) {
    throw new Error('Table not allowed');
  }

  const params: Array<string | number | null> = [];

  const selectClause = source.field ? buildSelectClause(source.field) : '*';

  let sql = 'SELECT ' + selectClause + ' FROM ' + source.table;

  // Build WHERE clause
  const whereConditions: string[] = [];

  if (source.filter) {
    const builtFilter = buildFilterClause(source.filter);
    whereConditions.push('(' + builtFilter.clause + ')');
    params.push(...builtFilter.params);
  }

  // Add date filter for tables with snapshot_date or created_at
  if (source.table === 'performance_stats') {
    whereConditions.push('snapshot_date = ?');
    params.push(date);
  } else if (source.table === 'interaction_logs') {
    whereConditions.push('DATE(created_at) = ?');
    params.push(date);
  }

  if (whereConditions.length > 0) {
    sql += ' WHERE ' + whereConditions.join(' AND ');
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
      // If aggregation already done in SQL, use that.
      // SQLite aggregates can return NULL when there are no rows; coerce to 0.
      if (data[formula.field!] !== undefined && data[formula.field!] !== null) {
        const v = Number(data[formula.field!]);
        return Number.isFinite(v) ? v : 0;
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
      throw new Error('Unknown formula type: ' + (formula as any).type);
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
  parts.push('**' + definition.name + '** (' + kpi_id + ')');
  parts.push('\n' + definition.stakeholder_description);

  // Formula explanation
  parts.push('\n\n**How it\'s calculated:**');
  parts.push(explainFormula(definition.formula));

  // Current value and threshold (if provided)
  if (currentValue !== undefined) {
    const level = determineThresholdLevel(currentValue, definition.thresholds);
    const emoji = getThresholdEmoji(level);

    parts.push(
      '\n\n**Current value:** ' + formatValue(currentValue, definition.formula) + ' ' + emoji
    );
    parts.push('**Performance level:** ' + level);
  }

  // Thresholds
  parts.push('\n\n**Thresholds:**');
  parts.push('- Excellent: ' + formatValue(definition.thresholds.excellent, definition.formula, true));
  parts.push('- Good: ' + formatValue(definition.thresholds.good, definition.formula, true));
  parts.push(
    '- Acceptable: ' + formatValue(definition.thresholds.acceptable, definition.formula, true)
  );
  parts.push('- Poor: ' + formatValue(definition.thresholds.poor, definition.formula, true));

  return parts.join('\n');
}

/**
 * Explain how a formula works
 */
function explainFormula(formula: Formula): string {
  switch (formula.type) {
    case 'ratio':
      return (
        formula.numerator +
        ' ÷ ' +
        formula.denominator +
        (formula.scale !== 1 ? ' × ' + formula.scale : '')
      );

    case 'percentage':
      return '(' + formula.numerator + ' ÷ ' + formula.denominator + ') × 100';

    case 'count':
      return 'Count of ' + formula.field;

    case 'average':
      return 'Average of ' + formula.field + ' (' + (formula.aggregation || 'mean') + ')';

    case 'threshold':
      return 'Value of ' + formula.field;

    case 'custom':
      return 'Custom function: ' + (formula.custom_function || 'unknown');

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
    return percentValue.toFixed(1) + '%';
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
  }

  // lower_is_better
  if (value <= thresholds.excellent) return 'excellent';
  if (value <= thresholds.good) return 'good';
  if (value <= thresholds.acceptable) return 'acceptable';
  if (value <= thresholds.poor) return 'poor';
  return 'critical';
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
    critical: '🚨',
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
  const agentKPIs = Array.from(definitions.values()).filter((def) => def.agent_id === agent_id);

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
            data_sources: definition.data_sources.map((ds) => ds.table),
            computed_at: new Date().toISOString(),
          },
        });
      } catch (error) {
        console.warn('Failed to compute ' + definition.kpi_id + ':', error);
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
  return Array.from(definitions.values()).filter((def) => def.category === category);
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
  determineThresholdLevel,
};
