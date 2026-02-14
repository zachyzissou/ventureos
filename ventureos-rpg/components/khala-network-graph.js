import { fetchJson, clamp } from './rpg-utils.js';

const STYLE = `
:host{
  display:block;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
  --protoss-cyan:#00E5FF;
  --panel-bg: rgba(0,0,0,0.25);
  --panel-border: rgba(255,255,255,0.14);
  --text: rgba(255,255,255,0.92);
  --muted: rgba(255,255,255,0.62);
}

.wrap{
  border:1px solid var(--panel-border);
  background: linear-gradient(180deg, rgba(0,229,255,0.05), rgba(124,77,255,0.03));
  border-radius:14px;
  padding:14px;
}

.hdr{ display:flex; align-items:flex-end; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.hdr h3{ margin:0; font-size:14px; color: var(--text); letter-spacing:0.01em; }
.controls{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
label{ color: var(--muted); font-size:12px; }
input[type="range"]{ width:180px; }
.value{ color: var(--text); font-size:12px; font-variant-numeric: tabular-nums; }

.canvas{ margin-top:12px; position:relative; }
svg{ width:100%; height:420px; display:block; border-radius:12px; background: rgba(0,0,0,0.20); border:1px solid rgba(255,255,255,0.10); }

.tooltip{
  position:absolute;
  pointer-events:none;
  background: rgba(0,0,0,0.80);
  border:1px solid rgba(255,255,255,0.16);
  border-radius:10px;
  padding:10px;
  color: rgba(255,255,255,0.92);
  font-size:11px;
  max-width: 360px;
  display:none;
  box-shadow: 0 10px 30px rgba(0,0,0,0.35);
}
.tooltip .t{ font-weight:650; margin-bottom:4px; }
.tooltip .m{ color: rgba(255,255,255,0.68); }

.details{
  margin-top:12px;
  display:grid;
  grid-template-columns: 1fr;
  gap:8px;
}
.details-title{ font-size:12px; color: var(--muted); }
pre{ margin:0; padding:10px; background: rgba(0,0,0,0.28); border:1px solid rgba(255,255,255,0.12); border-radius:12px; overflow:auto; color: rgba(255,255,255,0.86); font-size:11px; }
.state{ color: var(--muted); font-size:12px; }
.err{ color:#FF5252; }
`;

export class KhalaNetworkGraph extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._data = null;
    this._error = null;
    this._loading = false;
    this._threshold = 0.7;
    this._d3 = null;
    this._sim = null;
    this._resizeObs = null;

    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <div class="wrap">
        <div class="hdr">
          <h3>Khala Network — Psionic Bonds</h3>
          <div class="controls">
            <label for="thr">Affinity threshold</label>
            <input id="thr" type="range" min="0.10" max="0.95" step="0.05" value="0.70" />
            <div class="value" id="thrVal">≥ 0.70</div>
            <button id="refresh" style="padding:4px 10px;border-radius:999px;border:1px solid rgba(255,255,255,0.14);background:rgba(0,0,0,0.20);color:rgba(255,255,255,0.88);cursor:pointer;font-size:11px;">Refresh</button>
          </div>
        </div>

        <div class="canvas">
          <div class="tooltip" id="tip"></div>
          <svg id="svg" viewBox="0 0 900 420" preserveAspectRatio="xMidYMid meet"></svg>
        </div>

        <div class="details">
          <div class="details-title">Bond details (click an edge)</div>
          <pre id="details">(none selected)</pre>
        </div>

        <div class="state" id="state" style="display:none;"></div>
      </div>
    `;
  }

  connectedCallback() {
    const thr = this.shadowRoot.getElementById('thr');
    thr.addEventListener('input', () => {
      this._threshold = Number(thr.value);
      this.shadowRoot.getElementById('thrVal').textContent = `≥ ${this._threshold.toFixed(2)}`;
      this.renderGraph();
    });
    this.shadowRoot.getElementById('refresh').addEventListener('click', () => this.load());

    this._resizeObs = new ResizeObserver(() => {
      // Re-render (D3 handles positions; but we need to re-center force).
      this.renderGraph(true);
    });
    this._resizeObs.observe(this);

    this.load();
  }

  disconnectedCallback() {
    try { this._resizeObs?.disconnect(); } catch {}
    try { this._sim?.stop(); } catch {}
  }

  async load() {
    this._loading = true;
    this._error = null;
    this.setState(`Loading Khala network…`);

    try {
      this._d3 = this._d3 || (await import('https://cdn.jsdelivr.net/npm/d3@7/+esm'));
      const data = await fetchJson('/api/rpg/khala-network?driftLimit=6');
      if (!data?.ok) throw new Error(data?.error || 'Bad response');
      this._data = data;
      this._loading = false;
      this.setState(null);
      this.renderGraph(true);
    } catch (e) {
      this._loading = false;
      this._data = null;
      this._error = String(e?.message || e);
      this.setState(`Error: ${this._error}`, true);
    }
  }

  setState(msg, isErr = false) {
    const el = this.shadowRoot.getElementById('state');
    if (!msg) { el.style.display = 'none'; el.textContent = ''; el.className = 'state'; return; }
    el.style.display = '';
    el.textContent = msg;
    el.className = isErr ? 'state err' : 'state';
  }

  renderGraph(forceRestart = false) {
    if (!this._data || !this._d3) return;

    const d3 = this._d3;
    const svg = d3.select(this.shadowRoot.getElementById('svg'));
    const tip = this.shadowRoot.getElementById('tip');

    // Clear previous
    svg.selectAll('*').remove();
    try { this._sim?.stop(); } catch {}

    const width = 900;
    const height = 420;

    const nodes = (this._data.nodes || []).map(n => ({
      id: n.id,
      agentId: n.agentId || n.id,
      unit: n.unit,
      role: n.role,
      theme: n.theme,
      rank: n.rank
    }));

    const edgesAll = (this._data.edges || []);
    const edges = edgesAll.filter(e => (e.affinity ?? 0) >= this._threshold);

    const links = edges.map(e => ({
      source: e.agentA,
      target: e.agentB,
      affinity: e.affinity,
      seedValue: e.seedValue,
      interactionCount: e.interactionCount,
      lastInteractionAt: e.lastInteractionAt,
      driftHistory: e.driftHistory || []
    }));

    // Underlay glow
    svg.append('defs').html(`
      <filter id="glow">
        <feGaussianBlur stdDeviation="2.2" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    `);

    const g = svg.append('g');

    const link = g.append('g')
      .attr('stroke', 'rgba(0,229,255,0.55)')
      .attr('stroke-opacity', 0.85)
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke-width', l => 1 + (l.affinity * 5.5))
      .attr('filter', 'url(#glow)');

    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .style('cursor', 'default');

    node.append('circle')
      .attr('r', n => 8 + (Number(n.rank) ? Number(n.rank) * 1.1 : 10))
      .attr('fill', n => n.theme?.primary || '#00E5FF')
      .attr('fill-opacity', 0.80)
      .attr('stroke', 'rgba(255,255,255,0.45)')
      .attr('stroke-width', 1.0);

    node.append('text')
      .text(n => n.id)
      .attr('x', 12)
      .attr('y', 4)
      .attr('fill', 'rgba(255,255,255,0.86)')
      .attr('font-size', 11)
      .attr('font-family', 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace');

    // Tooltip helpers
    const showTip = (html, evt) => {
      tip.innerHTML = html;
      tip.style.display = 'block';
      const box = this.shadowRoot.querySelector('.canvas').getBoundingClientRect();
      const x = evt.clientX - box.left + 14;
      const y = evt.clientY - box.top + 14;
      tip.style.left = `${x}px`;
      tip.style.top = `${y}px`;
    };
    const hideTip = () => { tip.style.display = 'none'; tip.innerHTML = ''; };

    link
      .on('mousemove', (evt, l) => {
        const drift = (l.driftHistory || []).slice(0, 4).map(d => {
          const sign = (d.delta ?? 0) >= 0 ? '+' : '';
          return `<div class="m">${d.createdAt}: ${sign}${(d.delta ?? 0).toFixed(2)} — ${escapeHtml(d.reason || '')}</div>`;
        }).join('');
        const title = `<div class="t">${l.source.id || l.source} ↔ ${l.target.id || l.target} · ${Number(l.affinity).toFixed(2)}</div>`;
        showTip(title + (drift || `<div class="m">No drift events recorded.</div>`), evt);
      })
      .on('mouseleave', () => hideTip())
      .on('click', (_evt, l) => {
        const details = {
          agentA: l.source.id || l.source,
          agentB: l.target.id || l.target,
          affinity: l.affinity,
          seedValue: l.seedValue,
          interactionCount: l.interactionCount,
          lastInteractionAt: l.lastInteractionAt,
          driftHistory: l.driftHistory
        };
        this.shadowRoot.getElementById('details').textContent = JSON.stringify(details, null, 2);
      });

    node
      .on('mousemove', (evt, n) => {
        showTip(`<div class="t">${escapeHtml(n.unit || n.id)}</div><div class="m">${escapeHtml(n.id)} · rank ${n.rank ?? '--'} · ${escapeHtml(n.role || '')}</div>`, evt);
      })
      .on('mouseleave', () => hideTip());

    // Zoom/pan
    svg.call(
      d3.zoom().scaleExtent([0.6, 2.4]).on('zoom', (event) => {
        g.attr('transform', event.transform);
      })
    );

    // Force simulation
    this._sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(l => 140 - (l.affinity * 55)).strength(l => clamp(l.affinity, 0.1, 0.95)))
      .force('charge', d3.forceManyBody().strength(-420))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(n => 16 + (Number(n.rank) ? Number(n.rank) * 0.6 : 10)));

    this._sim.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    if (forceRestart) {
      this._sim.alpha(1).restart();
    }

    // Update header info
    this.shadowRoot.getElementById('details').dataset.edgesShown = String(links.length);
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

customElements.define('khala-network-graph', KhalaNetworkGraph);
