export const AGENT_META = {
  echo: { unit: 'Artanis', role: 'CEO Orchestrator', color: '#F6C445' },
  nexus: { unit: 'Nexus', role: 'Mission Control Hub', color: '#00E5FF' },
  oracle: { unit: 'Zeratul (Dark Templar Prelate)', role: 'Research & Foresight', color: '#7C4DFF' },
  atlas: { unit: 'Probe', role: 'Infrastructure Fabricator', color: '#00E676' },
  sentinel: { unit: 'Sentinel (Stalker variant)', role: 'Security Guardian', color: '#FF5252' },
  verifier: { unit: 'Observer', role: 'Detection & Reconnaissance', color: '#69F0AE' },
  archivist: { unit: 'High Templar', role: 'Knowledge Keeper', color: '#40C4FF' },
  synth: { unit: 'Dark Templar', role: 'Shadow Weaver / Creator', color: '#B388FF' }
};

export function agentMeta(agentId) {
  const id = String(agentId || '').toLowerCase();
  return AGENT_META[id] || { unit: id, role: 'Unknown', color: '#00E5FF' };
}

export function clamp(n, lo, hi) {
  const v = Number(n);
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

export function fmtPct(x, digits = 0) {
  if (x === null || x === undefined) return '--';
  const v = Number(x);
  if (!Number.isFinite(v)) return '--';
  return (v * 100).toFixed(digits) + '%';
}

export function fmtNum(x, digits = 0) {
  if (x === null || x === undefined) return '--';
  const v = Number(x);
  if (!Number.isFinite(v)) return '--';
  return v.toFixed(digits);
}

export function rankTierFromValue(value) {
  const v = clamp(value, 0, 100);
  if (v >= 90) return 'legendary';
  if (v >= 75) return 'elite';
  if (v >= 60) return 'high';
  if (v >= 40) return 'mid';
  return 'low';
}

export async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} for ${url}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}
