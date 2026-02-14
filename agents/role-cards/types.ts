/**
 * TypeScript type definitions for VentureOS Role Card Schema
 * Auto-generated from schema.json
 * 
 * Usage:
 * - Import these types for type-safe role card manipulation
 * - Use for validation in agent orchestration code
 * - Reference in conversation mechanics implementation
 */

// ============================================================================
// Core Types
// ============================================================================

export type AgentId = 
  | 'oracle'
  | 'atlas'
  | 'sentinel'
  | 'verifier'
  | 'archivist'
  | 'synth'
  | 'echo'
  | 'nexus';

export type ProtossUnit =
  | 'Zeratul'
  | 'Probe'
  | 'Sentinel'
  | 'High Templar'
  | 'Observer'
  | 'Dark Templar'
  | 'Executor'
  | 'Nexus';

export type DataFormat =
  | 'natural_language'
  | 'json'
  | 'markdown'
  | 'yaml'
  | 'structured_query'
  | 'structured_report'
  | 'file_path'
  | 'url';

export type EnforcementMethod =
  | 'permission_check'
  | 'api_key_restriction'
  | 'network_policy'
  | 'file_system_permission'
  | 'citation_detector'
  | 'number_source_tracker'
  | 'comparison_verifier'
  | 'pattern_matcher'
  | 'training'
  | 'few_shot_examples'
  | 'manual_review';

export type ViolationSeverity = 'warning' | 'block' | 'escalate';

export type EscalationPriority = 'low' | 'medium' | 'high' | 'critical';

export type MetricCategory = 'quality' | 'reliability' | 'efficiency' | 'impact';

export type KPIThresholdLevel = 'excellent' | 'good' | 'acceptable' | 'poor';

// ============================================================================
// Domain Definition
// ============================================================================

export interface Domain {
  mission: string;
  responsibilities: string[];
  boundaries: string[];
}

// ============================================================================
// Input/Output Contracts
// ============================================================================

export interface InputContract {
  source: string; // AgentId | 'user' | 'system' | 'external_api'
  type: string; // Semantic type (e.g., 'research_request', 'deployment_request')
  format: DataFormat;
  schema?: JSONSchema; // For json/yaml formats
  optional?: boolean;
}

export interface OutputContract {
  target: string; // AgentId | 'user' | 'system' | 'external_api'
  type: string; // Semantic type (e.g., 'research_report', 'deployment_status')
  format: DataFormat;
  schema?: JSONSchema;
  guarantees?: string[]; // Quality guarantees for this output
}

// JSON Schema type (simplified, full schema would be more complex)
export interface JSONSchema {
  type: string;
  required?: string[];
  properties?: Record<string, any>;
  items?: any;
  enum?: any[];
  [key: string]: any;
}

// ============================================================================
// Hard Bans (3-Tier Enforcement)
// ============================================================================

export interface InfrastructureBan {
  rule: string;
  enforcement: Extract<
    EnforcementMethod,
    'permission_check' | 'api_key_restriction' | 'network_policy' | 'file_system_permission'
  >;
  rationale?: string;
}

export interface HeuristicBan {
  rule: string;
  enforcement: Extract<
    EnforcementMethod,
    'citation_detector' | 'number_source_tracker' | 'comparison_verifier' | 'pattern_matcher'
  >;
  severity: ViolationSeverity;
  falsePositiveRate?: number; // 0-1
}

export interface QualityBan {
  rule: string;
  enforcement: Extract<EnforcementMethod, 'training' | 'few_shot_examples' | 'manual_review'>;
  examples?: string[];
}

export interface HardBans {
  infrastructure: InfrastructureBan[];
  heuristic: HeuristicBan[];
  quality: QualityBan[];
}

// ============================================================================
// Escalation System
// ============================================================================

export interface EscalationTrigger {
  condition: string;
  action: string;
  target?: string; // AgentId | 'user' | 'system'
  priority?: EscalationPriority;
  autoResolve?: boolean;
}

export interface EscalationQualityTracking {
  signalRatioTarget: number; // 0-1
  adaptiveSensitivity?: boolean;
}

export interface Escalation {
  triggers: EscalationTrigger[];
  qualityTracking?: EscalationQualityTracking;
}

// ============================================================================
// Metrics & KPIs
// ============================================================================

export interface Metric {
  name: string;
  kpi_id: string;
  category?: MetricCategory;
  threshold?: {
    excellent?: number;
    good?: number;
    acceptable?: number;
    poor?: number;
  };
}

// ============================================================================
// Agent Interfaces (Interaction Topology)
// ============================================================================

export interface AgentInterfaces {
  upstream?: string[]; // Agents that send work to this agent
  core_partners?: string[]; // Agents frequently collaborated with
  downstream?: string[]; // Agents that receive work from this agent
}

// ============================================================================
// Conversation Directives (VOXYZ-inspired)
// ============================================================================

export interface ConflictPairDirective {
  agent: AgentId;
  directive: string;
  affinity: number; // 0-1
}

export interface AlliancePairDirective {
  agent: AgentId;
  directive: string;
  affinity: number; // 0-1
}

export interface ConversationDirectives {
  conflict_pairs?: ConflictPairDirective[];
  alliance_pairs?: AlliancePairDirective[];
}

// ============================================================================
// Complete Role Card
// ============================================================================

export interface RoleCard {
  agentId: AgentId;
  displayName: string;
  protossUnit: ProtossUnit;
  role: string;
  domain: Domain;
  inputs: InputContract[];
  outputs: OutputContract[];
  definitionOfDone: string[];
  hardBans: HardBans;
  escalation: Escalation;
  metrics: Metric[];
  interfaces?: AgentInterfaces;
  personalityProtocol?: string;
  conversationDirectives?: ConversationDirectives;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate handoff between two agents
 * Checks if fromAgent's output contract matches toAgent's input contract
 */
export async function validateHandoff(
  fromAgent: AgentId,
  toAgent: AgentId,
  payload: any,
  roleCards: Map<AgentId, RoleCard>
): Promise<HandoffValidationResult> {
  const fromCard = roleCards.get(fromAgent);
  const toCard = roleCards.get(toAgent);

  if (!fromCard || !toCard) {
    return {
      valid: false,
      reason: `Role card not found for ${!fromCard ? fromAgent : toAgent}`,
    };
  }

  // Find matching output/input contracts
  const outputContract = fromCard.outputs.find((o) => o.target === toAgent);
  const inputContract = toCard.inputs.find((i) => i.source === fromAgent);

  if (!outputContract) {
    return {
      valid: false,
      reason: `${fromAgent} has no output contract targeting ${toAgent}`,
    };
  }

  if (!inputContract) {
    return {
      valid: false,
      reason: `${toAgent} has no input contract from ${fromAgent}`,
    };
  }

  // Validate format compatibility
  if (outputContract.format !== inputContract.format) {
    return {
      valid: false,
      reason: `Format mismatch: ${fromAgent} outputs ${outputContract.format}, ${toAgent} expects ${inputContract.format}`,
    };
  }

  // Validate type compatibility
  if (outputContract.type !== inputContract.type) {
    return {
      valid: false,
      reason: `Type mismatch: ${fromAgent} outputs ${outputContract.type}, ${toAgent} expects ${inputContract.type}`,
    };
  }

  // Schema validation (if both contracts have schemas)
  if (outputContract.schema && inputContract.schema) {
    const schemaValid = await validateSchema(payload, inputContract.schema);
    if (!schemaValid.valid) {
      return {
        valid: false,
        reason: `Payload schema validation failed: ${schemaValid.errors?.join(', ')}`,
      };
    }
  }

  return {
    valid: true,
    fromAgent,
    toAgent,
    contract: {
      type: outputContract.type,
      format: outputContract.format,
    },
  };
}

export interface HandoffValidationResult {
  valid: boolean;
  reason?: string;
  fromAgent?: AgentId;
  toAgent?: AgentId;
  contract?: {
    type: string;
    format: DataFormat;
  };
}

/**
 * Validate payload against JSON Schema
 * (Simplified - real implementation would use ajv or similar)
 */
export async function validateSchema(
  payload: any,
  schema: JSONSchema
): Promise<SchemaValidationResult> {
  // Placeholder - implement with ajv or similar JSON Schema validator
  // For now, just check required fields exist
  if (schema.required && Array.isArray(schema.required)) {
    const missingFields = schema.required.filter(
      (field) => payload[field] === undefined
    );
    if (missingFields.length > 0) {
      return {
        valid: false,
        errors: missingFields.map((field) => `Missing required field: ${field}`),
      };
    }
  }

  return { valid: true };
}

export interface SchemaValidationResult {
  valid: boolean;
  errors?: string[];
}

/**
 * Check if agent has permission for action
 * (Infrastructure-level hard ban enforcement)
 */
export function checkInfrastructurePermission(
  agentId: AgentId,
  action: string,
  roleCard: RoleCard
): PermissionCheckResult {
  const infrastructureBans = roleCard.hardBans.infrastructure;

  for (const ban of infrastructureBans) {
    // Simple keyword matching - real implementation would be more sophisticated
    if (action.toLowerCase().includes(ban.rule.toLowerCase().split(' ')[1])) {
      return {
        allowed: false,
        reason: ban.rule,
        enforcement: ban.enforcement,
        rationale: ban.rationale,
      };
    }
  }

  return { allowed: true };
}

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  enforcement?: string;
  rationale?: string;
}

/**
 * Load all role cards from filesystem
 */
export async function loadAllRoleCards(): Promise<Map<AgentId, RoleCard>> {
  const roleCards = new Map<AgentId, RoleCard>();
  const agentIds: AgentId[] = [
    'oracle',
    'atlas',
    'sentinel',
    'verifier',
    'archivist',
    'synth',
    'echo',
    'nexus',
  ];

  for (const agentId of agentIds) {
    const roleCard = await loadRoleCard(agentId);
    roleCards.set(agentId, roleCard);
  }

  return roleCards;
}

/**
 * Load single role card from filesystem
 */
export async function loadRoleCard(agentId: AgentId): Promise<RoleCard> {
  const fs = await import('fs/promises');
  const path = await import('path');
  
  const roleCardPath = path.join(
    process.env.HOME!,
    'clawd/agents/role-cards',
    `${agentId}.json`
  );
  
  const content = await fs.readFile(roleCardPath, 'utf-8');
  return JSON.parse(content) as RoleCard;
}

// ============================================================================
// Enforcement Engine
// ============================================================================

/**
 * Three-tier enforcement system
 */
export class EnforcementEngine {
  constructor(private roleCards: Map<AgentId, RoleCard>) {}

  /**
   * Tier 1: Infrastructure enforcement (hard blocks)
   */
  async enforceInfrastructure(
    agentId: AgentId,
    action: string
  ): Promise<PermissionCheckResult> {
    const roleCard = this.roleCards.get(agentId);
    if (!roleCard) {
      return { allowed: false, reason: 'Role card not found' };
    }

    return checkInfrastructurePermission(agentId, action, roleCard);
  }

  /**
   * Tier 2: Heuristic enforcement (soft warnings → Verifier)
   */
  async enforceHeuristic(
    agentId: AgentId,
    content: string
  ): Promise<HeuristicViolation[]> {
    const roleCard = this.roleCards.get(agentId);
    if (!roleCard) {
      return [];
    }

    const violations: HeuristicViolation[] = [];
    const heuristicBans = roleCard.hardBans.heuristic;

    for (const ban of heuristicBans) {
      const detected = await this.detectHeuristicViolation(content, ban);
      if (detected) {
        violations.push({
          agentId,
          rule: ban.rule,
          enforcement: ban.enforcement,
          severity: ban.severity,
          content,
        });
      }
    }

    return violations;
  }

  /**
   * Tier 3: Quality guidelines (log for review, not enforced)
   */
  logQualityViolations(agentId: AgentId, content: string): QualityViolation[] {
    const roleCard = this.roleCards.get(agentId);
    if (!roleCard) {
      return [];
    }

    const violations: QualityViolation[] = [];
    const qualityBans = roleCard.hardBans.quality;

    for (const ban of qualityBans) {
      if (ban.examples) {
        const hasViolation = ban.examples.some((example) =>
          content.toLowerCase().includes(example.toLowerCase())
        );
        if (hasViolation) {
          violations.push({
            agentId,
            rule: ban.rule,
            enforcement: ban.enforcement,
            content,
          });
        }
      }
    }

    return violations;
  }

  private async detectHeuristicViolation(
    content: string,
    ban: HeuristicBan
  ): Promise<boolean> {
    // Placeholder - real implementation would use ML models or pattern matching
    // For now, just simple keyword detection
    switch (ban.enforcement) {
      case 'citation_detector':
        return this.detectMissingCitations(content);
      case 'number_source_tracker':
        return this.detectUnsourcedNumbers(content);
      case 'comparison_verifier':
        return this.detectUnverifiedComparisons(content);
      case 'pattern_matcher':
        return false; // Implement pattern matching logic
      default:
        return false;
    }
  }

  private detectMissingCitations(content: string): boolean {
    // Simplified: check for numbers/claims without nearby citations
    const hasNumbers = /\d+%?/.test(content);
    const hasCitations = /\[.*?\]|\(.*?\)|https?:\/\//.test(content);
    return hasNumbers && !hasCitations;
  }

  private detectUnsourcedNumbers(content: string): boolean {
    const numberPattern = /\b\d+\.?\d*[kKmMbB]?\b/g;
    const citationPattern = /\[.*?\]|\(.*?\)|according to|per|via/i;
    
    const numbers = content.match(numberPattern);
    if (!numbers || numbers.length === 0) return false;
    
    return !citationPattern.test(content);
  }

  private detectUnverifiedComparisons(content: string): boolean {
    const comparisonPattern = /\b(better|worse|faster|slower|more|less) than\b/i;
    const citationPattern = /\[.*?\]|\(.*?\)|https?:\/\//;
    
    return comparisonPattern.test(content) && !citationPattern.test(content);
  }
}

export interface HeuristicViolation {
  agentId: AgentId;
  rule: string;
  enforcement: string;
  severity: ViolationSeverity;
  content: string;
}

export interface QualityViolation {
  agentId: AgentId;
  rule: string;
  enforcement: string;
  content: string;
}
