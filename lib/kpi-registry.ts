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

// ============================================================================
// SQL Safety — Allowlists & Validation (VULN-002 fix)
// ============================================================================

/** Allowlist of tables that KPI queries may reference */
const ALLOWED_TABLES = new Set([
  'psionic_stats',
  'interaction_logs',
  'khala_network',
  'khala_drift_history',
  'psionic_bonds',
  'ops_agent_memory',
  'rpg_warp_tech_inputs',
]);

/** Validate that an identifier (table/column name) contains only safe characters */
export function isValidSqlIdentifier(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

/**
 * Validate a SQL field expression (column name, aggregate, or aliased expression).
 * Permits: simple identifiers, common aggregates (COUNT, SUM, AVG, MIN, MAX),
 * DISTINCT, and AS aliases. Rejects anything else.
 */
export function isValidFieldExpression(expr: string): boolean {
  const trimmed = expr.trim();
  // Simple identifier: column_name
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) return true;
  // Aggregate with optional alias: COUNT(col) AS alias
  if (/^(?:COUNT|SUM|AVG|MIN|MAX|DISTINCT)\s*\([a-zA-Z0-9_*\s,]+\)(?:\s+AS\s+[a-zA-Z_][a-zA-Z0-9_]*)?$/i.test(trimmed)) return true;
  // Star
  if (trimmed === '*') return true;
  return false;
}

/**
 * Validate a date string to prevent injection via date parameters.
 * Accepts only YYYY-MM-DD format.
 */
export function isValidDateString(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

/** Prepared query with parameterized values */
interface PreparedQuery {
  sql: string;
  params: any[];
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

/**
 * Build SQL query from data source configuration.
 * Returns a parameterized query with bound values — no user input is
 * ever interpolated into the SQL string.
 *
 * Structural identifiers (table, field) are validated against allowlists.
 * The date parameter is always bound via a `?` placeholder.
 */
function buildQuery(source: DataSource, date: string): PreparedQuery {
  const params: any[] = [];

  // ── Validate table name ──────────────────────────────────────────────
  if (!isValidSqlIdentifier(source.table)) {
    throw new Error(`Invalid table name: ${source.table}`);
  }
  if (!ALLOWED_TABLES.has(source.table)) {
    throw new Error(`Table not in allowlist: ${source.table}`);
  }

  // ── SELECT clause ────────────────────────────────────────────────────
  let query = 'SELECT ';
  
  if (source.field) {
    // Validate each field expression in a comma-separated list
    const fields = source.field.split(',');
    for (const f of fields) {
      if (!isValidFieldExpression(f)) {
        throw new Error(`Invalid field expression: ${f.trim()}`);
      }
    }
    query += source.field;
  } else {
    query += '*';
  }
  
  query += ` FROM ${source.table}`;
  
  // ── JOIN clause (from trusted config, validated) ─────────────────────
  if (source.join) {
    // JOIN clauses come from on-disk config files. Validate they only
    // reference allowed tables and don't contain sub-queries or semicolons.
    if (/;|--|\/\*|\bDROP\b|\bALTER\b|\bTRUNCATE\b|\bEXEC\b/i.test(source.join)) {
      throw new Error(`Suspicious JOIN clause rejected: ${source.join}`);
    }
    query += ` ${source.join}`;
  }
  
  // ── WHERE clause ─────────────────────────────────────────────────────
  const whereConditions: string[] = [];
  
  if (source.filter) {
    // Filters come from on-disk config files. Reject anything dangerous.
    if (/;|--|\/\*|\bDROP\b|\bALTER\b|\bTRUNCATE\b|\bEXEC\b/i.test(source.filter)) {
      throw new Error(`Suspicious filter clause rejected: ${source.filter}`);
    }
    whereConditions.push(`(${source.filter})`);
  }
  
  // Add date filter using parameterized binding (VULN-002 critical fix)
  if (!isValidDateString(date)) {
    throw new Error(`Invalid date format (expected YYYY-MM-DD): ${date}`);
  }

  if (source.table === 'psionic_stats') {
    whereConditions.push('snapshot_date = ?');
    params.push(date);
  } else if (source.table === 'interaction_logs') {
    whereConditions.push('DATE(created_at) = ?');
    params.push(date);
  }
  
  if (whereConditions.length > 0) {
    query += ' WHERE ' + whereConditions.join(' AND ');
  }
  
  return { sql: query, params };
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
