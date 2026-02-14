import { agentMeta, fetchJson, fmtNum, fmtPct } from './rpg-utils.js';
import './psionic-attribute-bar.js';

const STYLE = `
:host{
  display:block;
  --protoss-cyan:#00E5FF;
  --protoss-gold:#F6C445;
  --protoss-purple:#7C4DFF;
  --panel-bg: rgba(0,0,0,0.25);
  --panel-border: rgba(255,255,255,0.14);
  --text: rgba(255,255,255,0.92);
  --muted: rgba(255,255,255,0.62);
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
}

.card{
  border:1px solid var(--panel-border);
  background: linear-gradient(180deg, rgba(0,229,255,0.06), rgba(124,77,255,0.04));
  border-radius:14px;
  padding:14px;
  box-shadow: 0 0 0 1px rgba(0,0,0,0.2), 0 12px 30px rgba(0,0,0,0.20);
}

.hdr{ display:flex; justify-content:space-between; gap:12px; align-items:flex-start; }
.title{ display:flex; flex-direction:column; gap:3px; }
.unit{ font-size:14px; color:var(--text); font-weight:650; letter-spacing:0.01em; }
.sub{ font-size:12px; color:var(--muted); }
.badges{ display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
.badge{ font-size:11px; padding:4px 8px; border-radius:999px; border:1px solid rgba(255,255,255,0.14); color:var(--text);
  background: rgba(0,0,0,0.20);
}
.badge strong{ font-weight:650; }

.sep{ height:1px; background: rgba(255,255,255,0.10); margin:12px 0; }

.attrs{ display:grid; grid-template-columns: 1fr; gap:10px; }

.protocols{ display:flex; flex-wrap:wrap; gap:6px; }
.protocol{ font-size:11px; padding:4px 8px; border-radius:999px; border:1px solid rgba(0,229,255,0.20);
  background: rgba(0,229,255,0.07); color: var(--text);
}
.protocol.off{ border-color: rgba(255,255,255,0.14); background: rgba(255,255,255,0.05); color: var(--muted); }

.details{ margin-top:10px; }
.details summary{ cursor:pointer; color: var(--protoss-cyan); font-size:12px; }
pre{ margin:8px 0 0 0; padding:10px; background: rgba(0,0,0,0.30); border:1px solid rgba(255,255,255,0.12); border-radius:10px; overflow:auto; color: rgba(255,255,255,0.86); font-size:11px; }

.state{ color: var(--muted); font-size:12px; }
.err{ color: #FF5252; }
`;

const ATTR_LABELS = {
  WIS: 'Psionic Mastery',
  SPD: 'Energy',
  TRU: 'Shields',
  CRE: 'Warp Technology',
  RCH: 'Psi Reach'
};

export class TacticalOverlayPanel extends HTMLElement {
  static get observedAttributes() { return ['agent']; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._data = null;
    this._error = null;
    this._loading = false;
    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <div class="card">
        <div class="state" id="state">Loading…</div>
        <div id="body" style="display:none;"></div>
      </div>
    `;
  }

  connectedCallback() {
    this.load();
  }

  attributeChangedCallback() {
    this.load();
  }

  get agent() {
    return (this.getAttribute('agent') || '').toLowerCase();
  }

  async load() {
    const agent = this.agent;
    if (!agent) {
      this._error = 'Missing agent attribute';
      this._data = null;
      this.render();
      return;
    }

    this._loading = true;
    this._error = null;
    this.render();

    try {
      const data = await fetchJson(`/api/rpg/tactical-overlay/${encodeURIComponent(agent)}`);
      if (!data?.ok) throw new Error(data?.error || 'Bad response');
      this._data = data;
    } catch (e) {
      this._data = null;
      this._error = String(e?.message || e);
    } finally {
      this._loading = false;
      this.render();
    }
  }

  render() {
    const stateEl = this.shadowRoot.getElementById('state');
    const bodyEl = this.shadowRoot.getElementById('body');

    if (this._loading) {
      stateEl.style.display = '';
      stateEl.className = 'state';
      stateEl.textContent = `Loading tactical overlay: ${this.agent}…`;
      bodyEl.style.display = 'none';
      bodyEl.innerHTML = '';
      return;
    }

    if (this._error) {
      stateEl.style.display = '';
      stateEl.className = 'state err';
      stateEl.textContent = `Error: ${this._error}`;
      bodyEl.style.display = 'none';
      bodyEl.innerHTML = '';
      return;
    }

    const d = this._data;
    if (!d) {
      stateEl.style.display = '';
      stateEl.className = 'state';
      stateEl.textContent = 'No data.';
      bodyEl.style.display = 'none';
      bodyEl.innerHTML = '';
      return;
    }

    stateEl.style.display = 'none';
    bodyEl.style.display = '';

    const meta = agentMeta(d.agentId);
    const rank = d.rank?.rank ?? null;
    const xp = d.rank?.xp ?? null;

    const protocols = Array.isArray(d.activeProtocols) ? d.activeProtocols : [];

    const attrs = d.attributes || {};
    const rows = ['WIS','SPD','TRU','CRE','RCH'].map(code => {
      const v = attrs[code];
      return `<psionic-attribute-bar agent="${d.agentId}" attribute="${code}" value="${v ?? ''}" label="${ATTR_LABELS[code]}"></psionic-attribute-bar>`;
    }).join('');

    const protoHtml = protocols.length
      ? protocols.map(p => `<span class="protocol">${p.protocolId}</span>`).join('')
      : `<span class="protocol off">No active protocols</span>`;

    const warpInputs = d.warpTechInputs ? JSON.stringify(d.warpTechInputs, null, 2) : null;

    bodyEl.innerHTML = `
      <div class="hdr">
        <div class="title">
          <div class="unit" style="color:${meta.color}">${d.unit || meta.unit}</div>
          <div class="sub">${d.agentId} · ${d.role || meta.role}</div>
        </div>
        <div class="badges">
          <div class="badge"><strong>Rank</strong> ${rank ?? '--'}</div>
          <div class="badge"><strong>XP</strong> ${xp ?? '--'}</div>
          <div class="badge" title="Snapshot date"><strong>Snap</strong> ${d.snapshotDate || '--'}</div>
        </div>
      </div>

      <div class="sep"></div>

      <div class="attrs">
        ${rows}
      </div>

      <div class="sep"></div>

      <div style="display:flex;flex-direction:column;gap:8px;">
        <div class="sub" style="font-weight:650;color:rgba(255,255,255,0.78)">Active Protocols</div>
        <div class="protocols">${protoHtml}</div>
      </div>

      <details class="details">
        <summary>Warp Tech Inputs (audit)</summary>
        ${warpInputs ? `<pre>${escapeHtml(warpInputs)}</pre>` : `<div class="state">No warp tech inputs stored.</div>`}
      </details>

      <details class="details">
        <summary>Raw metrics</summary>
        <pre>${escapeHtml(JSON.stringify(d.raw || {}, null, 2))}</pre>
      </details>
    `;
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

customElements.define('tactical-overlay-panel', TacticalOverlayPanel);
