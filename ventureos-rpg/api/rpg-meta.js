const AGENT_META = {
  echo: {
    agentId: 'echo',
    unit: 'Artanis',
    role: 'CEO Orchestrator',
    theme: { primary: '#F6C445', accent: '#00E5FF' }
  },
  nexus: {
    agentId: 'nexus',
    unit: 'Nexus',
    role: 'Mission Control Hub',
    theme: { primary: '#00E5FF', accent: '#7C4DFF' }
  },
  oracle: {
    agentId: 'oracle',
    unit: 'Zeratul (Dark Templar Prelate)',
    role: 'Research & Foresight',
    theme: { primary: '#7C4DFF', accent: '#00E5FF' }
  },
  atlas: {
    agentId: 'atlas',
    unit: 'Probe',
    role: 'Infrastructure Fabricator',
    theme: { primary: '#00E676', accent: '#00E5FF' }
  },
  sentinel: {
    agentId: 'sentinel',
    unit: 'Sentinel (Stalker variant)',
    role: 'Security Guardian',
    theme: { primary: '#FF5252', accent: '#00E5FF' }
  },
  verifier: {
    agentId: 'verifier',
    unit: 'Observer',
    role: 'Detection & Reconnaissance',
    theme: { primary: '#69F0AE', accent: '#00E5FF' }
  },
  archivist: {
    agentId: 'archivist',
    unit: 'High Templar',
    role: 'Knowledge Keeper',
    theme: { primary: '#40C4FF', accent: '#F6C445' }
  },
  synth: {
    agentId: 'synth',
    unit: 'Dark Templar',
    role: 'Shadow Weaver / Creator',
    theme: { primary: '#B388FF', accent: '#00E5FF' }
  }
};

function getAgentMeta(agentId) {
  const safe = String(agentId || '').toLowerCase();
  return AGENT_META[safe] || { agentId: safe, unit: safe, role: 'Unknown', theme: { primary: '#00E5FF', accent: '#7C4DFF' } };
}

module.exports = { AGENT_META, getAgentMeta };
