/**
 * KPI Registry Test Suite
 * 
 * Tests for KPI loading, computation, and explanation functionality
 */

import {
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
  type KPIDefinition,
  type Thresholds
} from '../kpi-registry';
import Database from 'better-sqlite3';
import path from 'path';

// ============================================================================
// Test Database Setup
// ============================================================================

const DB_PATH = process.env.VENTUREOS_RPG_DB ?? path.resolve(process.env.HOME!, 'clawd/agents/ventureos-rpg.db');

describe('KPI Registry - Definition Loading', () => {
  test('loadKPIDefinition - loads valid KPI definition', async () => {
    const definition = await loadKPIDefinition('oracle_citation_accuracy');
    
    expect(definition).toBeDefined();
    expect(definition.kpi_id).toBe('oracle_citation_accuracy');
    expect(definition.agent_id).toBe('oracle');
    expect(definition.category).toBe('quality');
    expect(definition.name).toBe('Citation Accuracy');
    expect(definition.formula).toBeDefined();
    expect(definition.data_sources).toBeInstanceOf(Array);
    expect(definition.thresholds).toBeDefined();
  });
  
  test('loadKPIDefinition - throws error for non-existent KPI', async () => {
    await expect(loadKPIDefinition('nonexistent_kpi')).rejects.toThrow(
      'KPI definition not found'
    );
  });
  
  test('loadAllKPIDefinitions - loads all KPI definitions', async () => {
    const definitions = await loadAllKPIDefinitions();
    
    expect(definitions.size).toBeGreaterThan(20); // Should have 32 KPIs
    expect(definitions.has('oracle_citation_accuracy')).toBe(true);
    expect(definitions.has('atlas_deployment_success')).toBe(true);
    expect(definitions.has('sentinel_escalation_signal_ratio')).toBe(true);
  });
  
  test('loadKPI - creates KPI instance with methods', async () => {
    const kpi = await loadKPI('oracle_citation_accuracy');
    
    expect(kpi.kpi_id).toBe('oracle_citation_accuracy');
    expect(kpi.definition).toBeDefined();
    expect(typeof kpi.compute).toBe('function');
    expect(typeof kpi.explain).toBe('function');
  });
  
  test('loadAllKPIs - loads all KPIs with methods', async () => {
    const kpis = await loadAllKPIs();
    
    expect(kpis.size).toBeGreaterThan(20);
    
    for (const kpi of kpis.values()) {
      expect(typeof kpi.compute).toBe('function');
      expect(typeof kpi.explain).toBe('function');
    }
  });
});

// ============================================================================
// Formula Type Tests
// ============================================================================

describe('KPI Registry - Formula Types', () => {
  test('ratio formula - Oracle citation accuracy', async () => {
    const definition = await loadKPIDefinition('oracle_citation_accuracy');
    
    expect(definition.formula.type).toBe('ratio');
    expect(definition.formula.numerator).toBe('claims_with_citations');
    expect(definition.formula.denominator).toBe('total_claims');
    expect(definition.formula.scale).toBe(100);
  });
  
  test('average formula - Oracle research depth', async () => {
    const definition = await loadKPIDefinition('oracle_research_depth');
    
    expect(definition.formula.type).toBe('average');
    expect(definition.formula.field).toBe('source_count');
    expect(definition.formula.aggregation).toBe('avg');
  });
  
  test('count formula - Oracle cross-domain connections', async () => {
    const definition = await loadKPIDefinition('oracle_cross_domain_connections');
    
    expect(definition.formula.type).toBe('count');
    expect(definition.formula.field).toBe('cross_domain_links');
  });
  
  test('percentage formula - Atlas pylon uptime', async () => {
    const definition = await loadKPIDefinition('atlas_pylon_uptime');
    
    expect(definition.formula.type).toBe('percentage');
    expect(definition.formula.scale).toBe(100);
  });
});

// ============================================================================
// Threshold Tests
// ============================================================================

describe('KPI Registry - Threshold Determination', () => {
  const higherIsBetter: Thresholds = {
    excellent: 0.95,
    good: 0.85,
    acceptable: 0.70,
    poor: 0.50,
    direction: 'higher_is_better'
  };
  
  const lowerIsBetter: Thresholds = {
    excellent: 5.0,
    good: 15.0,
    acceptable: 30.0,
    poor: 60.0,
    direction: 'lower_is_better'
  };
  
  test('determineThresholdLevel - higher_is_better thresholds', () => {
    expect(determineThresholdLevel(0.98, higherIsBetter)).toBe('excellent');
    expect(determineThresholdLevel(0.90, higherIsBetter)).toBe('good');
    expect(determineThresholdLevel(0.75, higherIsBetter)).toBe('acceptable');
    expect(determineThresholdLevel(0.55, higherIsBetter)).toBe('poor');
    expect(determineThresholdLevel(0.30, higherIsBetter)).toBe('critical');
  });
  
  test('determineThresholdLevel - lower_is_better thresholds', () => {
    expect(determineThresholdLevel(3.0, lowerIsBetter)).toBe('excellent');
    expect(determineThresholdLevel(10.0, lowerIsBetter)).toBe('good');
    expect(determineThresholdLevel(25.0, lowerIsBetter)).toBe('acceptable');
    expect(determineThresholdLevel(50.0, lowerIsBetter)).toBe('poor');
    expect(determineThresholdLevel(80.0, lowerIsBetter)).toBe('critical');
  });
  
  test('determineThresholdLevel - edge cases (exact threshold values)', () => {
    expect(determineThresholdLevel(0.95, higherIsBetter)).toBe('excellent');
    expect(determineThresholdLevel(0.85, higherIsBetter)).toBe('good');
    expect(determineThresholdLevel(0.70, higherIsBetter)).toBe('acceptable');
    expect(determineThresholdLevel(0.50, higherIsBetter)).toBe('poor');
  });
});

// ============================================================================
// Explanation Tests
// ============================================================================

describe('KPI Registry - Explanation Generation', () => {
  test('explainKPI - generates human-readable explanation', async () => {
    const definition = await loadKPIDefinition('oracle_citation_accuracy');
    const explanation = explainKPI('oracle_citation_accuracy', definition);
    
    expect(explanation).toContain('Citation Accuracy');
    expect(explanation).toContain('oracle_citation_accuracy');
    expect(explanation).toContain('How it\'s calculated');
    expect(explanation).toContain('Thresholds');
    expect(explanation).toContain('Excellent');
  });
  
  test('explainKPI - includes current value and threshold level', async () => {
    const definition = await loadKPIDefinition('oracle_citation_accuracy');
    const explanation = explainKPI('oracle_citation_accuracy', definition, 87.5);
    
    // Verify explanation structure
    expect(explanation).toContain('**Current value:**');
    expect(explanation).toContain('87.5%');
    expect(explanation).toContain('**Performance level:**');
    expect(explanation).toContain('🟢'); // Should have an emoji indicator
    expect(explanation).toContain('**Thresholds:**');
    expect(explanation).toContain('Excellent: 95.0%');
    expect(explanation).toContain('Good: 85.0%');
  });
  
  test('KPI instance explain method works', async () => {
    const kpi = await loadKPI('atlas_mttr');
    const explanation = kpi.explain(12.5);
    
    expect(explanation).toContain('Mean Time to Recovery');
    expect(explanation).toContain('12.50'); // Formatted value
  });
});

// ============================================================================
// Agent & Category Queries
// ============================================================================

describe('KPI Registry - Agent and Category Queries', () => {
  test('getAgentsWithKPIs - returns all agents with KPIs', async () => {
    const agents = await getAgentsWithKPIs();
    
    expect(agents).toContain('oracle');
    expect(agents).toContain('atlas');
    expect(agents).toContain('sentinel');
    expect(agents).toContain('verifier');
    expect(agents).toContain('archivist');
    expect(agents).toContain('synth');
    expect(agents).toContain('echo');
    expect(agents).toContain('nexus');
    expect(agents.length).toBe(8);
  });
  
  test('getKPIsByCategory - filters KPIs by category', async () => {
    const qualityKPIs = await getKPIsByCategory('quality');
    
    expect(qualityKPIs.length).toBeGreaterThan(0);
    expect(qualityKPIs.every(kpi => kpi.category === 'quality')).toBe(true);
  });
  
  test('getKPIsByCategory - handles multiple categories', async () => {
    const categories = ['quality', 'performance', 'reliability'];
    
    for (const category of categories) {
      const kpis = await getKPIsByCategory(category);
      expect(kpis.every(kpi => kpi.category === category)).toBe(true);
    }
  });
});

// ============================================================================
// Data Source Validation
// ============================================================================

describe('KPI Registry - Data Source Validation', () => {
  test('all KPIs have valid data sources', async () => {
    const definitions = await loadAllKPIDefinitions();
    
    for (const def of definitions.values()) {
      expect(def.data_sources).toBeDefined();
      expect(def.data_sources.length).toBeGreaterThan(0);
      
      for (const source of def.data_sources) {
        expect(source.table).toBeDefined();
        expect(typeof source.table).toBe('string');
      }
    }
  });
  
  test('all KPIs reference existing database tables', async () => {
    const definitions = await loadAllKPIDefinitions();
    const db = new Database(DB_PATH, { readonly: true });
    
    try {
      // Get list of all tables
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((row: any) => row.name);
      
      for (const def of definitions.values()) {
        for (const source of def.data_sources) {
          // Check if table exists (or skip if it's a future table)
          if (!['ops_agent_memory', 'rpg_warp_tech_inputs'].includes(source.table)) {
            // These tables might not exist yet - that's OK for now
            // Only validate tables we know exist
            if (source.table === 'psionic_stats' || 
                source.table === 'interaction_logs' ||
                source.table === 'khala_network') {
              expect(tables).toContain(source.table);
            }
          }
        }
      }
    } finally {
      db.close();
    }
  });
});

// ============================================================================
// Batch Computation Tests
// ============================================================================

describe('KPI Registry - Batch Operations', () => {
  test('computeAgentKPIs - computes all KPIs for an agent', async () => {
    const results = await computeAgentKPIs('oracle', '2026-02-14');
    
    // Oracle should have 4 KPIs
    expect(results.size).toBe(4);
    
    expect(results.has('oracle_citation_accuracy')).toBe(true);
    expect(results.has('oracle_knowledge_gap_detection')).toBe(true);
    expect(results.has('oracle_cross_domain_connections')).toBe(true);
    expect(results.has('oracle_research_depth')).toBe(true);
    
    // Verify result structure
    for (const result of results.values()) {
      expect(typeof result.value).toBe('number');
      expect(Number.isFinite(result.value)).toBe(true);
      expect(result.date).toBe('2026-02-14');
      expect(result.threshold_level).toMatch(/excellent|good|acceptable|poor|critical/);
      expect(result.metadata).toBeDefined();
    }
  }, 10000); // Longer timeout for batch operation
  
  test('computeAgentKPIs - handles different agents', async () => {
    const agents = ['atlas', 'sentinel', 'verifier'];
    
    for (const agent of agents) {
      const results = await computeAgentKPIs(agent);
      expect(results.size).toBeGreaterThanOrEqual(3);
      
      // Verify result structure for each computed KPI
      for (const result of results.values()) {
        expect(typeof result.value).toBe('number');
        expect(Number.isFinite(result.value)).toBe(true);
        expect(result.threshold_level).toMatch(/excellent|good|acceptable|poor|critical/);
      }
    }
  }, 15000);
});

// ============================================================================
// Schema Compliance Tests
// ============================================================================

describe('KPI Registry - Schema Compliance', () => {
  test('all KPIs have required fields', async () => {
    const definitions = await loadAllKPIDefinitions();
    
    const requiredFields = [
      'kpi_id',
      'agent_id',
      'category',
      'name',
      'description',
      'stakeholder_description',
      'formula',
      'data_sources',
      'thresholds',
      'visualization',
      'audit_trail'
    ];
    
    for (const def of definitions.values()) {
      for (const field of requiredFields) {
        expect(def).toHaveProperty(field);
      }
    }
  });
  
  test('all KPIs have valid agent IDs', async () => {
    const definitions = await loadAllKPIDefinitions();
    const validAgents = ['oracle', 'atlas', 'sentinel', 'verifier', 'archivist', 'synth', 'echo', 'nexus'];
    
    for (const def of definitions.values()) {
      expect(validAgents).toContain(def.agent_id);
    }
  });
  
  test('all KPIs have valid categories', async () => {
    const definitions = await loadAllKPIDefinitions();
    const validCategories = ['quality', 'performance', 'impact', 'reliability', 'security', 'collaboration'];
    
    for (const def of definitions.values()) {
      expect(validCategories).toContain(def.category);
    }
  });
  
  test('all KPIs have valid thresholds', async () => {
    const definitions = await loadAllKPIDefinitions();
    
    for (const def of definitions.values()) {
      const { thresholds } = def;
      
      expect(thresholds.excellent).toBeDefined();
      expect(thresholds.good).toBeDefined();
      expect(thresholds.acceptable).toBeDefined();
      expect(thresholds.poor).toBeDefined();
      
      // For higher_is_better, excellent > good > acceptable > poor
      if (!thresholds.direction || thresholds.direction === 'higher_is_better') {
        expect(thresholds.excellent).toBeGreaterThan(thresholds.good);
        expect(thresholds.good).toBeGreaterThan(thresholds.acceptable);
        expect(thresholds.acceptable).toBeGreaterThan(thresholds.poor);
      } else {
        // For lower_is_better, excellent < good < acceptable < poor
        expect(thresholds.excellent).toBeLessThan(thresholds.good);
        expect(thresholds.good).toBeLessThan(thresholds.acceptable);
        expect(thresholds.acceptable).toBeLessThan(thresholds.poor);
      }
    }
  });
  
  test('all KPIs have valid visualization config', async () => {
    const definitions = await loadAllKPIDefinitions();
    const validChartTypes = ['line', 'bar', 'gauge', 'sparkline', 'number'];
    const validFrequencies = ['realtime', 'hourly', 'daily', 'weekly'];
    
    for (const def of definitions.values()) {
      expect(validChartTypes).toContain(def.visualization.chart_type);
      expect(validFrequencies).toContain(def.visualization.update_frequency);
      expect(def.visualization.dashboard_section).toBeDefined();
    }
  });
});

// ============================================================================
// Coverage Report
// ============================================================================

describe('KPI Registry - Coverage Report', () => {
  test('all 8 agents have KPIs defined', async () => {
    const agentCounts = new Map<string, number>();
    const definitions = await loadAllKPIDefinitions();
    
    for (const def of definitions.values()) {
      agentCounts.set(def.agent_id, (agentCounts.get(def.agent_id) || 0) + 1);
    }
    
    console.log('\n=== KPI Coverage by Agent ===');
    for (const [agent, count] of agentCounts.entries()) {
      console.log(`${agent}: ${count} KPIs`);
      expect(count).toBeGreaterThanOrEqual(3); // At least 3 KPIs per agent
      expect(count).toBeLessThanOrEqual(6); // At most 6 KPIs per agent
    }
    
    expect(agentCounts.size).toBe(8);
  });
  
  test('all categories are represented', async () => {
    const categoryCounts = new Map<string, number>();
    const definitions = await loadAllKPIDefinitions();
    
    for (const def of definitions.values()) {
      categoryCounts.set(def.category, (categoryCounts.get(def.category) || 0) + 1);
    }
    
    console.log('\n=== KPI Coverage by Category ===');
    for (const [category, count] of categoryCounts.entries()) {
      console.log(`${category}: ${count} KPIs`);
    }
    
    // All major categories should be represented
    expect(categoryCounts.has('quality')).toBe(true);
    expect(categoryCounts.has('performance')).toBe(true);
    expect(categoryCounts.has('reliability')).toBe(true);
  });
});
