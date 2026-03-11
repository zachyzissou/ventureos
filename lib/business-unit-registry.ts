/**
 * Business Unit Registry — VentureOS Queue Integration (P1 #30)
 *
 * Loads and validates business unit definitions from the runtime registry.
 * Used by the task queue router for portfolio-aware routing decisions.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// ============================================================================
// Types
// ============================================================================

export type BusinessUnitCategory = 'infra' | 'game' | 'app' | 'media' | 'personal';
export type BusinessUnitPriority = 'critical' | 'high' | 'medium' | 'low';
export type BusinessUnitStatus = 'active' | 'inactive' | 'archived';

export interface BusinessUnitRisk {
  external_publish_requires_approval: boolean;
  destructive_actions_requires_approval: boolean;
  config_changes_requires_approval: boolean;
}

export interface BusinessUnit {
  id: string;
  name: string;
  description?: string;
  category: BusinessUnitCategory;
  priority: BusinessUnitPriority;
  status: BusinessUnitStatus;
  owner_role?: string;
  risk?: BusinessUnitRisk;
  missionTypes?: string[];
  tags?: string[];
  cadence?: string;
  github?: string | null;
  repos?: Array<{ name: string; url: string; visibility?: string; note?: string }>;
}

export interface BusinessUnitRegistryDocument {
  $schema?: string;
  version: number;
  generated_at: string;
  units: BusinessUnit[];
  categories?: Record<string, string>;
  priorities?: Record<string, string>;
}

// ============================================================================
// Registry
// ============================================================================

const DEFAULT_REGISTRY_PATH = path.resolve(
  os.homedir(),
  'clawd/runtime/business-units.json'
);

/** Priority weights for routing decisions (higher = process first). */
const PRIORITY_WEIGHTS: Record<BusinessUnitPriority, number> = {
  critical: 400,
  high: 300,
  medium: 200,
  low: 100,
};

export interface BusinessUnitRegistryConfig {
  /** Path to the business-units.json file. */
  registryPath?: string;
  /** Optional: provide registry data directly (for tests). */
  data?: BusinessUnitRegistryDocument;
}

export class BusinessUnitRegistry {
  private units: Map<string, BusinessUnit> = new Map();
  private readonly registryPath: string;
  private loaded = false;

  constructor(config: BusinessUnitRegistryConfig = {}) {
    this.registryPath = config.registryPath ?? DEFAULT_REGISTRY_PATH;

    if (config.data) {
      this.loadFromDocument(config.data);
    }
  }

  /** Load registry from disk. */
  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.registryPath, 'utf8');
      const doc: BusinessUnitRegistryDocument = JSON.parse(raw);
      this.loadFromDocument(doc);
    } catch (err: any) {
      const prefix = `Failed to load business unit registry at ${this.registryPath}`;
      if (err?.code === 'ENOENT') {
        throw new Error(`${prefix}: file not found`, { cause: err });
      }
      if (err instanceof SyntaxError) {
        throw new Error(`${prefix}: invalid JSON (${err.message})`, { cause: err });
      }
      throw new Error(`${prefix}: ${err?.message ?? String(err)}`, { cause: err });
    }
  }

  /** Load from an in-memory document. */
  loadFromDocument(doc: BusinessUnitRegistryDocument): void {
    this.units.clear();
    for (const unit of doc.units ?? []) {
      this.units.set(unit.id, unit);
    }
    this.loaded = true;
  }

  /** Check if registry has been loaded. */
  isLoaded(): boolean {
    return this.loaded;
  }

  /** Get a business unit by ID. */
  get(id: string): BusinessUnit | undefined {
    return this.units.get(id);
  }

  /** Check if a business unit ID exists in the registry. */
  has(id: string): boolean {
    return this.units.has(id);
  }

  /** Validate a business unit ID. Returns error message or null. */
  validate(id: string): string | null {
    if (!id || typeof id !== 'string') return 'Business unit ID is required';
    if (!this.units.has(id)) return `Unknown business unit: ${id}`;
    const unit = this.units.get(id)!;
    if (unit.status !== 'active') return `Business unit is ${unit.status}: ${id}`;
    return null;
  }

  /** Validate a mission type against a business unit's allowed types. */
  validateMissionType(unitId: string, missionType: string): string | null {
    const unit = this.units.get(unitId);
    if (!unit) return `Unknown business unit: ${unitId}`;
    if (!unit.missionTypes?.length) return null; // No restrictions
    if (!unit.missionTypes.includes(missionType)) {
      return `Mission type '${missionType}' not allowed for ${unitId} (allowed: ${unit.missionTypes.join(', ')})`;
    }
    return null;
  }

  /** Get the priority weight for a business unit. */
  getPriorityWeight(id: string): number {
    const unit = this.units.get(id);
    if (!unit) return PRIORITY_WEIGHTS.medium;
    return PRIORITY_WEIGHTS[unit.priority] ?? PRIORITY_WEIGHTS.medium;
  }

  /** Get all registered unit IDs. */
  getUnitIds(): string[] {
    return Array.from(this.units.keys());
  }

  /** Get all units. */
  getAll(): BusinessUnit[] {
    return Array.from(this.units.values());
  }

  /** Get units filtered by category. */
  getByCategory(category: BusinessUnitCategory): BusinessUnit[] {
    return this.getAll().filter((u) => u.category === category);
  }

  /** Get units filtered by priority. */
  getByPriority(priority: BusinessUnitPriority): BusinessUnit[] {
    return this.getAll().filter((u) => u.priority === priority);
  }

  /** Check if a business unit requires approval for a given risk type. */
  requiresApproval(id: string, riskType: keyof BusinessUnitRisk): boolean {
    const unit = this.units.get(id);
    if (!unit?.risk) return false;
    return unit.risk[riskType] ?? false;
  }
}
