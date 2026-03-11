/**
 * Business Unit Registry Tests — VentureOS Queue Integration (P1 #30)
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  BusinessUnitRegistry,
  type BusinessUnitRegistryDocument,
  type BusinessUnit,
} from '../business-unit-registry';

// ── Fixtures ─────────────────────────────────────────────────────────

function makeRegistry(units?: BusinessUnit[]): BusinessUnitRegistry {
  return new BusinessUnitRegistry({
    data: {
      version: 2,
      generated_at: '2026-02-15',
      units: units ?? defaultUnits(),
    },
  });
}

function defaultUnits(): BusinessUnit[] {
  return [
    {
      id: 'ventureos',
      name: 'VentureOS',
      category: 'infra',
      priority: 'critical',
      status: 'active',
      owner_role: 'Helmsman',
      missionTypes: ['build', 'ops', 'infra'],
      risk: {
        external_publish_requires_approval: true,
        destructive_actions_requires_approval: true,
        config_changes_requires_approval: true,
      },
    },
    {
      id: 'bloom',
      name: 'Bloom',
      category: 'game',
      priority: 'high',
      status: 'active',
      owner_role: 'Producer',
      missionTypes: ['build', 'content', 'research'],
      risk: {
        external_publish_requires_approval: true,
        destructive_actions_requires_approval: true,
        config_changes_requires_approval: false,
      },
    },
    {
      id: 'fotopress',
      name: 'FotoPress',
      category: 'app',
      priority: 'low',
      status: 'active',
      owner_role: 'Producer',
      missionTypes: ['build', 'content'],
    },
    {
      id: 'archived-project',
      name: 'Archived',
      category: 'app',
      priority: 'low',
      status: 'archived',
    },
  ];
}

// ── Tests ────────────────────────────────────────────────────────────

describe('BusinessUnitRegistry', () => {
  describe('constructor & loading', () => {
    it('loads from data in constructor', () => {
      const reg = makeRegistry();
      expect(reg.isLoaded()).toBe(true);
      expect(reg.getUnitIds()).toContain('ventureos');
      expect(reg.getUnitIds()).toContain('bloom');
    });

    it('reports not loaded when no data provided', () => {
      const reg = new BusinessUnitRegistry();
      expect(reg.isLoaded()).toBe(false);
    });

    it('loads from document explicitly', () => {
      const reg = new BusinessUnitRegistry();
      reg.loadFromDocument({
        version: 2,
        generated_at: '2026-02-15',
        units: [{ id: 'test', name: 'Test', category: 'app', priority: 'low', status: 'active' }],
      });

      expect(reg.isLoaded()).toBe(true);
      expect(reg.has('test')).toBe(true);
    });

    it('throws descriptive error for invalid JSON', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bu-registry-'));
      const filePath = path.join(tmpDir, 'business-units.json');
      await fs.writeFile(filePath, '{"version":2,"units":[}', 'utf8');

      const reg = new BusinessUnitRegistry({ registryPath: filePath });
      await expect(reg.load()).rejects.toThrow(`Failed to load business unit registry at ${filePath}: invalid JSON`);

      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('throws descriptive error for missing file', async () => {
      const filePath = path.join(os.tmpdir(), `missing-business-units-${Date.now()}.json`);
      const reg = new BusinessUnitRegistry({ registryPath: filePath });

      await expect(reg.load()).rejects.toThrow(`Failed to load business unit registry at ${filePath}: file not found`);
    });
  });

  describe('get / has', () => {
    it('gets a unit by id', () => {
      const reg = makeRegistry();
      const unit = reg.get('ventureos');
      expect(unit).toBeDefined();
      expect(unit?.name).toBe('VentureOS');
      expect(unit?.priority).toBe('critical');
    });

    it('returns undefined for unknown id', () => {
      const reg = makeRegistry();
      expect(reg.get('nonexistent')).toBeUndefined();
    });

    it('has() returns true for known units', () => {
      const reg = makeRegistry();
      expect(reg.has('bloom')).toBe(true);
      expect(reg.has('nope')).toBe(false);
    });
  });

  describe('validate', () => {
    it('returns null for valid active unit', () => {
      const reg = makeRegistry();
      expect(reg.validate('ventureos')).toBeNull();
    });

    it('rejects empty/null id', () => {
      const reg = makeRegistry();
      expect(reg.validate('')).toBe('Business unit ID is required');
      expect(reg.validate(null as unknown as string)).toBe('Business unit ID is required');
    });

    it('rejects unknown unit', () => {
      const reg = makeRegistry();
      expect(reg.validate('unknown')).toBe('Unknown business unit: unknown');
    });

    it('rejects archived unit', () => {
      const reg = makeRegistry();
      expect(reg.validate('archived-project')).toBe('Business unit is archived: archived-project');
    });
  });

  describe('validateMissionType', () => {
    it('returns null for allowed mission type', () => {
      const reg = makeRegistry();
      expect(reg.validateMissionType('ventureos', 'build')).toBeNull();
      expect(reg.validateMissionType('ventureos', 'ops')).toBeNull();
    });

    it('rejects disallowed mission type', () => {
      const reg = makeRegistry();
      const err = reg.validateMissionType('ventureos', 'content');
      expect(err).toContain('not allowed');
      expect(err).toContain('ventureos');
    });

    it('rejects unknown unit', () => {
      const reg = makeRegistry();
      expect(reg.validateMissionType('unknown', 'build')).toContain('Unknown business unit');
    });

    it('allows any mission type when unit has no restrictions', () => {
      const reg = makeRegistry([
        { id: 'open', name: 'Open', category: 'app', priority: 'low', status: 'active' },
      ]);
      expect(reg.validateMissionType('open', 'build')).toBeNull();
      expect(reg.validateMissionType('open', 'anything' as any)).toBeNull();
    });
  });

  describe('getPriorityWeight', () => {
    it('returns correct weights', () => {
      const reg = makeRegistry();
      expect(reg.getPriorityWeight('ventureos')).toBe(400); // critical
      expect(reg.getPriorityWeight('bloom')).toBe(300);     // high
      expect(reg.getPriorityWeight('fotopress')).toBe(100); // low
    });

    it('returns medium weight for unknown units', () => {
      const reg = makeRegistry();
      expect(reg.getPriorityWeight('unknown')).toBe(200);
    });
  });

  describe('getAll / getByCategory / getByPriority', () => {
    it('returns all units', () => {
      const reg = makeRegistry();
      expect(reg.getAll()).toHaveLength(4);
    });

    it('filters by category', () => {
      const reg = makeRegistry();
      const infra = reg.getByCategory('infra');
      expect(infra).toHaveLength(1);
      expect(infra[0].id).toBe('ventureos');
    });

    it('filters by priority', () => {
      const reg = makeRegistry();
      const critical = reg.getByPriority('critical');
      expect(critical).toHaveLength(1);
      expect(critical[0].id).toBe('ventureos');
    });
  });

  describe('requiresApproval', () => {
    it('returns true when approval required', () => {
      const reg = makeRegistry();
      expect(reg.requiresApproval('ventureos', 'external_publish_requires_approval')).toBe(true);
      expect(reg.requiresApproval('ventureos', 'destructive_actions_requires_approval')).toBe(true);
    });

    it('returns false when not required', () => {
      const reg = makeRegistry();
      expect(reg.requiresApproval('bloom', 'config_changes_requires_approval')).toBe(false);
    });

    it('returns false for unknown unit', () => {
      const reg = makeRegistry();
      expect(reg.requiresApproval('unknown', 'external_publish_requires_approval')).toBe(false);
    });

    it('returns false when unit has no risk config', () => {
      const reg = makeRegistry([
        { id: 'norisk', name: 'No Risk', category: 'app', priority: 'low', status: 'active' },
      ]);
      expect(reg.requiresApproval('norisk', 'external_publish_requires_approval')).toBe(false);
    });
  });
});
