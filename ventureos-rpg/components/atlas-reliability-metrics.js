import { fetchJson, fmtNum, fmtPct } from './rpg-utils.js';

const STYLE = `
:host{
  display:block;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
  --protoss-cyan:#00E5FF;
  --protoss-gold:#F6C445;
  --panel-border: rgba(255,255,255,0.14);
  --text: rgba(255,255,255,0.92);
  --muted: rgba(255,255,255,0.62);
}

.wrap{
  border:1px solid var(--panel-border);
  background: linear-gradient(180deg, rgba(0,230,118,0.05), rgba(0,229,255,0.04));
  border-radius:14px;
  padding:14px;
}

.hdr{ display:flex; align-items:baseline; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.hdr h3{ margin:0; font-size:14px; color: var(--text); letter-spacing:0.01em; }
.hdr .sub{ font-size:12px; color: var(--muted); }

.grid{ margin-top:12px; display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:10px; }
@media (max-width: 900px){ .grid{ grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 600px){ .grid{ grid-template-columns: 1fr; } }

.metric{
  border:1px solid rgba(255,255,255,0.12);
  background: rgba(0,0,0,0.20);
  border-radius:12px;
  padding:12px;
  display:flex;
  flex-direction:column;
  gap:6px;
}
.label{ font-size:11px; color: var(--muted); letter-spacing:0.02em; }
.val{ font-size:16px; color: var(--text); font-weight:700; font-variant-numeric: tabular-nums; }
.hint{ font-size:10px; color: rgba(255,255,255,0.52); }

.state{ font-size:12px; color: var(--muted); }
.err{ color:#FF5252; }

.dot{ display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; vertical-align:middle; }
.dot.good{ background:#00E676; box-shadow:0 0 10px rgba(0,230,118,0.25); }
.dot.warn{ background:#F6C445; box-shadow:0 0 10px rgba(246,196,69,0.25); }
.dot.bad{ background:#FF5252; box-shadow:0 0 10px rgba(255,82,82,0.25); }
`;

export class AtlasReliabilityMetrics extends HTMLElement {
  static get observedAttributes() { return ['agent']; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._data = null;
    this._error = null;
    this._loading = false;

    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <div class="wrap">
        <div class="hdr">
          <h3>Atlas Reliability Metrics</h3>
          <div class="sub" id="sub">--</div>
        </div>
        <div id="state" class="state">Loading…</div>
        <div id="grid" class="grid" style="display:none;"></div>
      </div>
    `;
  }

  connectedCallback() { this.load(); }
  attributeChangedCallback() { this.load(); }

  get agent() { return (this.getAttribute('agent') || 'atlas').toLowerCase(); }

  async load() {
    this._loading = true;
    this._error = null;
    this.render();

    try {
      const data = await fetchJson(`/api/rpg/stats/${encodeURIComponent(this.agent)}`);
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
    const state = this.shadowRoot.getElementById('state');
    const grid = this.shadowRoot.getElementById('grid');
    const sub = this.shadowRoot.getElementById('sub');

    if (this._loading) {
      sub.textContent = `agent=${this.agent}`;
      state.style.display = '';
      state.className = 'state';
      state.textContent = 'Loading Atlas metrics…';
      grid.style.display = 'none';
      grid.innerHTML = '';
      return;
    }

    if (this._error) {
      sub.textContent = `agent=${this.agent}`;
      state.style.display = '';
      state.className = 'state err';
      state.textContent = `Error: ${this._error}`;
      grid.style.display = 'none';
      grid.innerHTML = '';
      return;
    }

    const d = this._data;
    if (!d) {
      sub.textContent = `agent=${this.agent}`;
      state.style.display = '';
      state.className = 'state';
      state.textContent = 'No data.';
      grid.style.display = 'none';
      grid.innerHTML = '';
      return;
    }

    state.style.display = 'none';
    grid.style.display = '';

    const raw = d.raw || {};
    const warp = d.warpTechInputs?.warp_inputs || d.warpTechInputs?.warp || null;

    const deploymentSuccess = warp?.change_success_rate ?? raw.success_rate;
    const pylonUptime = raw.success_rate;
    const warpInSuccess = warp?.slo_compliance ?? raw.acceptance_rate;
    const backupSuccess = raw.success_rate; // proxy until explicit backup telemetry lands in DB

    const mttr = raw.mttr_minutes;

    const incident = incidentIndicator({ mttrMinutes: mttr, successRate: raw.success_rate, p95Latency: raw.p95_latency_s });

    sub.textContent = `snapshot=${d.snapshotDate || '--'} · rank=${d.rank?.rank ?? '--'}`;

    grid.innerHTML = [
      metricCard('Deployment success', fmtPct(deploymentSuccess, 1), 'proxy: change_success_rate / success_rate', scoreDot(deploymentSuccess)),
      metricCard('MTTR', mttr != null ? `${fmtNum(mttr, 1)} min` : '--', 'mean time to recovery (minutes)', mttrDot(mttr)),
      metricCard('Pylon uptime', fmtPct(pylonUptime, 1), 'proxy: success_rate', scoreDot(pylonUptime)),
      metricCard('Warp-in success', fmtPct(warpInSuccess, 1), 'proxy: SLO compliance / acceptance_rate', scoreDot(warpInSuccess)),
      metricCard('Backup success', fmtPct(backupSuccess, 1), 'proxy until backup jobs are logged into RPG DB', scoreDot(backupSuccess)),
      metricCard('Incident response', incident.label, incident.hint, `<span class="dot ${incident.level}"></span>`)
    ].join('');
  }
}

function metricCard(label, value, hint, dotHtml) {
  return `
    <div class="metric">
      <div class="label">${label}</div>
      <div class="val">${dotHtml || ''}${value}</div>
      <div class="hint">${hint}</div>
    </div>
  `;
}

function scoreDot(rate) {
  const v = Number(rate);
  if (!Number.isFinite(v)) return '<span class="dot warn"></span>';
  if (v >= 0.97) return '<span class="dot good"></span>';
  if (v >= 0.90) return '<span class="dot warn"></span>';
  return '<span class="dot bad"></span>';
}

function mttrDot(mttrMinutes) {
  const v = Number(mttrMinutes);
  if (!Number.isFinite(v)) return '<span class="dot warn"></span>';
  if (v <= 60) return '<span class="dot good"></span>';
  if (v <= 240) return '<span class="dot warn"></span>';
  return '<span class="dot bad"></span>';
}

function incidentIndicator({ mttrMinutes, successRate, p95Latency }) {
  const mttr = Number(mttrMinutes);
  const succ = Number(successRate);
  const p95 = Number(p95Latency);

  const hasMttr = Number.isFinite(mttr);
  const hasSucc = Number.isFinite(succ);

  let level = 'warn';
  if ((hasSucc && succ < 0.9) || (hasMttr && mttr > 240)) level = 'bad';
  else if ((hasSucc && succ >= 0.97) && (hasMttr && mttr <= 60)) level = 'good';

  const label = level === 'good' ? 'Operational' : level === 'bad' ? 'Degraded' : 'Watch';
  const hint = `derived from success_rate, mttr_minutes${Number.isFinite(p95) ? `, p95_latency_s=${p95.toFixed(1)}` : ''}`;

  return { level, label, hint };
}

customElements.define('atlas-reliability-metrics', AtlasReliabilityMetrics);
