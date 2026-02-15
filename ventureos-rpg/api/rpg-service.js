const path = require('path');
const os = require('os');
const { sqliteJson, sanitizeAgentId, sanitizeInt } = require('./sqlite-cli');
const { getAgentMeta, AGENT_META } = require('./rpg-meta');

function defaultDbPath() {
  return process.env.VENTUREOS_RPG_DB || path.join(os.homedir(), 'clawd', 'agents', 'ventureos-rpg.db');
}

function mapStatsRow(row) {
  if (!row) return null;
  return {
    agentId: row.agent_id,
    snapshotDate: row.snapshot_date,
    attributes: {
      WIS: row.psionic_mastery ?? null,
      SPD: row.energy ?? null,
      TRU: row.shields ?? null,
      CRE: row.warp_technology ?? null,
      RCH: row.psi_reach ?? null
    },
    raw: {
      memory_count: row.memory_count ?? null,
      unique_domains: row.unique_domains ?? null,
      canonical_edits: row.canonical_edits ?? null,
      p95_latency_s: row.p95_latency_s ?? null,
      mttr_minutes: row.mttr_minutes ?? null,
      acceptance_rate: row.acceptance_rate ?? null,
      success_rate: row.success_rate ?? null,
      approval_accuracy: row.approval_accuracy ?? null,
      tasks_completed: row.tasks_completed ?? null
    },
    warpTechInputs: (() => {
      try {
        if (!row.warp_tech_inputs) return null;
        return JSON.parse(row.warp_tech_inputs);
      } catch {
        return { _parseError: true, raw: row.warp_tech_inputs };
      }
    })()
  };
}

function mapRankRow(row) {
  if (!row) return null;
  return {
    rank: row.rank ?? null,
    xp: row.xp ?? null,
    xpFromMemory: row.xp_from_memory ?? null,
    xpFromMissions: row.xp_from_missions ?? null,
    nextRankAt: row.next_rank_at ?? null,
    updatedAt: row.updated_at ?? null,
    rankAchievedAt: row.rank_achieved_at ?? null
  };
}

async function getLatestStatsAll({ dbPath = defaultDbPath() } = {}) {
  const sql = `
    WITH latest AS (
      SELECT agent_id, MAX(snapshot_date) AS snapshot_date
      FROM psionic_stats
      GROUP BY agent_id
    )
    SELECT s.*, r.rank, r.xp, r.xp_from_memory, r.xp_from_missions, r.next_rank_at, r.updated_at AS rank_updated_at
    FROM psionic_stats s
    JOIN latest l ON l.agent_id = s.agent_id AND l.snapshot_date = s.snapshot_date
    LEFT JOIN psionic_ranks r ON r.agent_id = s.agent_id
    ORDER BY s.agent_id ASC;
  `;
  const rows = await sqliteJson(dbPath, sql);
  const agents = rows.map(r => {
    const stats = mapStatsRow(r);
    const rank = mapRankRow({
      rank: r.rank,
      xp: r.xp,
      xp_from_memory: r.xp_from_memory,
      xp_from_missions: r.xp_from_missions,
      next_rank_at: r.next_rank_at,
      updated_at: r.rank_updated_at
    });
    const meta = getAgentMeta(stats.agentId);
    return { ...meta, ...stats, rank };
  });
  return {
    ok: true,
    dbPath,
    updatedAt: new Date().toISOString(),
    agents
  };
}

async function getLatestStatsAgent(agentId, { dbPath = defaultDbPath() } = {}) {
  const safe = sanitizeAgentId(agentId);
  if (!safe) return { ok: false, error: 'Bad agent id' };

  const sql = `
    SELECT s.*, r.rank, r.xp, r.xp_from_memory, r.xp_from_missions, r.next_rank_at, r.updated_at AS rank_updated_at
    FROM psionic_stats s
    LEFT JOIN psionic_ranks r ON r.agent_id = s.agent_id
    WHERE s.agent_id = '${safe}'
    ORDER BY s.snapshot_date DESC
    LIMIT 1;
  `;
  const rows = await sqliteJson(dbPath, sql);
  const row = rows[0];
  if (!row) return { ok: false, error: 'Not found', agentId: safe };
  const stats = mapStatsRow(row);
  const rank = mapRankRow({
    rank: row.rank,
    xp: row.xp,
    xp_from_memory: row.xp_from_memory,
    xp_from_missions: row.xp_from_missions,
    next_rank_at: row.next_rank_at,
    updated_at: row.rank_updated_at
  });
  const meta = getAgentMeta(safe);
  return { ok: true, ...meta, ...stats, rank, updatedAt: new Date().toISOString() };
}

async function getActiveProtocols(agentId, { dbPath = defaultDbPath(), limit = 20 } = {}) {
  const safe = sanitizeAgentId(agentId);
  if (!safe) return { ok: false, error: 'Bad agent id' };
  const lim = Math.max(1, Math.min(200, sanitizeInt(limit, 20)));
  const sql = `
    SELECT agent_id, protocol_id, protocol_type, trigger_condition, activated_at, deactivated_at, mission_id
    FROM personality_activations
    WHERE agent_id = '${safe}' AND deactivated_at IS NULL
    ORDER BY activated_at DESC
    LIMIT ${lim};
  `;
  const rows = await sqliteJson(dbPath, sql);
  const protocols = rows.map(r => ({
    agentId: r.agent_id,
    protocolId: r.protocol_id,
    protocolType: r.protocol_type,
    triggerCondition: (() => {
      try { return r.trigger_condition ? JSON.parse(r.trigger_condition) : null; } catch { return r.trigger_condition || null; }
    })(),
    activatedAt: r.activated_at,
    missionId: r.mission_id
  }));
  return { ok: true, agentId: safe, updatedAt: new Date().toISOString(), protocols };
}

async function getTacticalOverlay(agentId, { dbPath = defaultDbPath() } = {}) {
  const base = await getLatestStatsAgent(agentId, { dbPath });
  if (!base.ok) return base;
  const protocols = await getActiveProtocols(agentId, { dbPath });

  // Provide a clean, display-friendly overlay shape.
  return {
    ok: true,
    agentId: base.agentId,
    unit: base.unit,
    role: base.role,
    theme: base.theme,
    snapshotDate: base.snapshotDate,
    rank: base.rank,
    attributes: base.attributes,
    raw: base.raw,
    activeProtocols: protocols.protocols,
    warpTechInputs: base.warpTechInputs,
    updatedAt: new Date().toISOString()
  };
}

async function getKhalaNetwork({ dbPath = defaultDbPath(), driftLimit = 8 } = {}) {
  const lim = Math.max(0, Math.min(50, sanitizeInt(driftLimit, 8)));
  const bonds = await sqliteJson(dbPath, `
    SELECT agent_a, agent_b, affinity, seed_value, last_interaction_at, interaction_count, updated_at
    FROM khala_network
    ORDER BY affinity DESC, agent_a ASC;
  `);

  const nodesSet = new Set();
  for (const b of bonds) { nodesSet.add(b.agent_a); nodesSet.add(b.agent_b); }

  const rankRows = await sqliteJson(dbPath, `
    SELECT agent_id, rank, xp
    FROM psionic_ranks;
  `);
  const rankByAgent = new Map(rankRows.map(r => [r.agent_id, { rank: r.rank ?? null, xp: r.xp ?? null }]));

  const nodes = Array.from(nodesSet).sort().map(id => {
    const meta = getAgentMeta(id);
    const rr = rankByAgent.get(id) || { rank: null, xp: null };
    return { id, ...meta, rank: rr.rank, xp: rr.xp };
  });

  // PERF-003: Batch drift history fetch — single query replaces N per-bond
  // queries (was 28+ queries, now 1). Uses ROW_NUMBER() window function to
  // limit results per bond pair, then groups in memory. Bond pairs are
  // normalised (agent_a < agent_b) by the khala_network CHECK constraint.
  let driftByBond = new Map();
  if (lim > 0) {
    try {
      const allDrift = await sqliteJson(dbPath, `
        WITH ranked AS (
          SELECT agent_a, agent_b,
                 old_affinity, new_affinity, delta, reason,
                 interaction_type, related_mission_id, created_at,
                 ROW_NUMBER() OVER (
                   PARTITION BY agent_a, agent_b
                   ORDER BY created_at DESC
                 ) AS rn
          FROM khala_drift_history
        )
        SELECT agent_a, agent_b,
               old_affinity, new_affinity, delta, reason,
               interaction_type, related_mission_id, created_at
        FROM ranked
        WHERE rn <= ${lim}
        ORDER BY agent_a, agent_b, created_at DESC;
      `);
      for (const d of allDrift) {
        const key = `${d.agent_a}|${d.agent_b}`;
        if (!driftByBond.has(key)) driftByBond.set(key, []);
        driftByBond.get(key).push(d);
      }
    } catch { driftByBond = new Map(); }
  }

  const edges = bonds.map(b => {
    const key = `${b.agent_a}|${b.agent_b}`;
    // Also check reversed key in case drift history isn't normalised
    const keyRev = `${b.agent_b}|${b.agent_a}`;
    const drift = driftByBond.get(key) || driftByBond.get(keyRev) || [];
    return {
      agentA: b.agent_a,
      agentB: b.agent_b,
      affinity: b.affinity,
      seedValue: b.seed_value,
      lastInteractionAt: b.last_interaction_at,
      interactionCount: b.interaction_count,
      updatedAt: b.updated_at,
      driftHistory: drift.map(d => ({
        oldAffinity: d.old_affinity,
        newAffinity: d.new_affinity,
        delta: d.delta,
        reason: d.reason,
        interactionType: d.interaction_type,
        relatedMissionId: d.related_mission_id,
        createdAt: d.created_at
      }))
    };
  });

  return { ok: true, dbPath, updatedAt: new Date().toISOString(), nodes, edges };
}

async function getKhalaNetworkForAgent(agentId, opts = {}) {
  const safe = sanitizeAgentId(agentId);
  if (!safe) return { ok: false, error: 'Bad agent id' };
  const net = await getKhalaNetwork(opts);
  if (!net.ok) return net;
  return {
    ok: true,
    agentId: safe,
    updatedAt: net.updatedAt,
    nodes: net.nodes,
    edges: net.edges.filter(e => e.agentA === safe || e.agentB === safe)
  };
}

async function getEscalationStats(agentId, { dbPath = defaultDbPath(), windowDays = 30 } = {}) {
  const safe = sanitizeAgentId(agentId);
  if (!safe) return { ok: false, error: 'Bad agent id' };
  const days = Math.max(1, Math.min(365, sanitizeInt(windowDays, 30)));

  const rows = await sqliteJson(dbPath, `
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN validated_as_real = 1 THEN 1 ELSE 0 END) AS validated_real,
      SUM(CASE WHEN validated_as_real = 0 THEN 1 ELSE 0 END) AS validated_false,
      SUM(CASE WHEN validated_as_real IS NULL THEN 1 ELSE 0 END) AS unvalidated
    FROM escalations
    WHERE escalated_by='${safe}'
      AND created_at >= datetime('now', '-${days} days');
  `);
  const r = rows[0] || {};
  const total = r.total ?? 0;
  const validatedReal = r.validated_real ?? 0;
  const signalRatio = total ? validatedReal / total : null;

  const bySeverity = await sqliteJson(dbPath, `
    SELECT COALESCE(NULLIF(severity, ''), 'unspecified') AS severity,
           COUNT(*) AS total,
           SUM(CASE WHEN validated_as_real = 1 THEN 1 ELSE 0 END) AS validated_real
    FROM escalations
    WHERE escalated_by='${safe}'
      AND created_at >= datetime('now', '-${days} days')
    GROUP BY severity
    ORDER BY total DESC;
  `);

  return {
    ok: true,
    agentId: safe,
    windowDays: days,
    updatedAt: new Date().toISOString(),
    escalation_quality: {
      total_escalations: total,
      validated_real_issues: validatedReal,
      signal_ratio: signalRatio
    },
    bySeverity: bySeverity.map(s => ({
      severity: s.severity,
      total: s.total,
      validatedReal: s.validated_real
    }))
  };
}

module.exports = {
  defaultDbPath,
  getLatestStatsAll,
  getLatestStatsAgent,
  getTacticalOverlay,
  getKhalaNetwork,
  getKhalaNetworkForAgent,
  getActiveProtocols,
  getEscalationStats,
  AGENT_META
};
