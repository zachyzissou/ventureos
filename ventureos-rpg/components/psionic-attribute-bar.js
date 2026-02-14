import { clamp, rankTierFromValue } from './rpg-utils.js';

const STYLE = `
:host{
  display:block;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
  --protoss-cyan:#00E5FF;
  --protoss-gold:#F6C445;
  --protoss-purple:#7C4DFF;
  --bg: rgba(0,0,0,0.25);
  --border: rgba(255,255,255,0.15);
  --text: rgba(255,255,255,0.92);
  --muted: rgba(255,255,255,0.65);
}

.wrap{ display:flex; flex-direction:column; gap:6px; }
.head{ display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
.label{ font-size:12px; color:var(--muted); letter-spacing:0.02em; }
.value{ font-size:12px; color:var(--text); font-variant-numeric: tabular-nums; }

.track{
  height:10px;
  border-radius:999px;
  background: var(--bg);
  border:1px solid var(--border);
  overflow:hidden;
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.25);
}
.fill{
  height:100%;
  width:0%;
  background: linear-gradient(90deg, var(--protoss-cyan), var(--protoss-purple));
  box-shadow: 0 0 10px rgba(0,229,255,0.25);
}

.tier-low .fill{ background: linear-gradient(90deg, rgba(255,255,255,0.18), var(--protoss-cyan)); }
.tier-mid .fill{ background: linear-gradient(90deg, var(--protoss-cyan), rgba(124,77,255,0.55)); }
.tier-high .fill{ background: linear-gradient(90deg, var(--protoss-cyan), var(--protoss-purple)); }
.tier-elite .fill{ background: linear-gradient(90deg, var(--protoss-purple), var(--protoss-gold)); box-shadow: 0 0 12px rgba(246,196,69,0.25); }
.tier-legendary .fill{ background: linear-gradient(90deg, var(--protoss-gold), #fff); box-shadow: 0 0 16px rgba(246,196,69,0.35); }

.code{ font-size:11px; color:var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
`;

export class PsionicAttributeBar extends HTMLElement {
  static get observedAttributes() {
    return ['agent', 'attribute', 'value', 'label'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <div class="wrap tier-mid">
        <div class="head">
          <div style="display:flex;align-items:baseline;gap:8px;">
            <div class="code" id="code">--</div>
            <div class="label" id="label">Attribute</div>
          </div>
          <div class="value" id="value">--</div>
        </div>
        <div class="track" aria-hidden="true"><div class="fill" id="fill"></div></div>
      </div>
    `;
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    this.render();
  }

  render() {
    const code = (this.getAttribute('attribute') || '').toUpperCase();
    const label = this.getAttribute('label') || code || 'Attribute';
    const rawValue = this.getAttribute('value');
    const value = clamp(rawValue ?? 0, 0, 100);

    const tier = rankTierFromValue(value);

    const wrap = this.shadowRoot.querySelector('.wrap');
    wrap.className = `wrap tier-${tier}`;

    this.shadowRoot.getElementById('code').textContent = code || '--';
    this.shadowRoot.getElementById('label').textContent = label;
    this.shadowRoot.getElementById('value').textContent = Number.isFinite(Number(rawValue)) ? `${Math.round(value)}` : '--';

    const fill = this.shadowRoot.getElementById('fill');
    fill.style.width = `${value}%`;
    this.setAttribute('role', 'img');
    this.setAttribute('aria-label', `${code} ${label}: ${Math.round(value)}`);
  }
}

customElements.define('psionic-attribute-bar', PsionicAttributeBar);
