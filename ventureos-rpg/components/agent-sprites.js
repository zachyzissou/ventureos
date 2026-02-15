/**
 * <agent-sprite> — 2D Pixel Art Sprites for VentureOS RPG Agents
 * 
 * Protoss-themed pixel art avatars for 8 agents.
 * States: idle, speaking, processing
 * Size: 64x64 canvas rendered via CSS box-shadow pixel art
 * 
 * Usage:
 *   <agent-sprite agent="oracle" state="speaking" size="64"></agent-sprite>
 *
 * Attributes:
 *   agent  — oracle|atlas|sentinel|verifier|archivist|synth|echo|nexus
 *   state  — idle|speaking|processing (default: idle)
 *   size   — pixel size (default: 64)
 */

// Protoss color palette
const PALETTE = {
  // Shared Protoss colors
  psiBlue:       '#00E5FF',
  psiBlueGlow:   '#00B8D4',
  psiPurple:     '#7C4DFF',
  psiPurpleGlow: '#651FFF',
  darkTeal:      '#004D40',
  gold:          '#FFD740',
  goldDark:      '#FFA000',
  white:         '#E0F7FA',
  lightGray:     '#B0BEC5',
  darkGray:      '#37474F',
  charcoal:      '#263238',
  black:         '#0D1117',
  red:           '#FF5252',
  green:         '#69F0AE',
  orange:        '#FFAB40',
  // Agent-specific accents
  oracleVoid:    '#9C27B0',
  oracleDark:    '#6A1B9A',
  sentinelBlue:  '#2979FF',
  synthShadow:   '#311B92',
  echoGold:      '#FFD700',
  nexusCrystal:  '#00BFA5',
  archiveAmber:  '#FF6F00',
  verifierGreen: '#00E676',
  atlasCopper:   '#FF8A65',
};

// Each sprite is defined as a 16x16 pixel grid (scaled to target size)
// Values are palette keys or null (transparent)
// Grid[row][col], row 0 = top

function makeOracleSprite() {
  // Zeratul — Dark Templar Prelate: hooded figure with glowing green eyes, void energy
  const _ = null;
  const v = 'oracleVoid';
  const d = 'oracleDark';
  const p = 'psiPurple';
  const g = 'green';
  const c = 'charcoal';
  const b = 'black';
  const w = 'white';
  const t = 'darkTeal';
  return [
    [_,_,_,_,_,d,d,d,d,d,d,_,_,_,_,_],
    [_,_,_,_,d,v,v,v,v,v,v,d,_,_,_,_],
    [_,_,_,d,v,v,v,v,v,v,v,v,d,_,_,_],
    [_,_,d,v,v,v,v,v,v,v,v,v,v,d,_,_],
    [_,_,d,v,v,v,v,v,v,v,v,v,v,d,_,_],
    [_,_,d,c,c,g,c,c,c,g,c,c,c,d,_,_],
    [_,_,d,c,g,g,g,c,c,g,g,g,c,d,_,_],
    [_,_,_,d,c,c,c,c,c,c,c,c,d,_,_,_],
    [_,_,_,d,c,c,c,p,c,c,c,c,d,_,_,_],
    [_,_,_,_,d,c,c,c,c,c,c,d,_,_,_,_],
    [_,_,_,d,v,v,d,d,d,v,v,v,d,_,_,_],
    [_,_,d,v,v,d,c,c,c,d,v,v,v,d,_,_],
    [_,d,v,v,d,c,c,c,c,c,d,v,v,d,_,_],
    [_,d,v,d,c,c,c,c,c,c,c,d,v,d,_,_],
    [_,_,d,d,_,_,d,d,d,_,_,d,d,_,_,_],
    [_,_,_,_,_,_,d,_,d,_,_,_,_,_,_,_],
  ];
}

function makeAtlasSprite() {
  // Probe — small floating worker bot with blue glow
  const _ = null;
  const a = 'atlasCopper';
  const b = 'psiBlue';
  const g = 'lightGray';
  const d = 'darkGray';
  const c = 'charcoal';
  const w = 'white';
  const k = 'black';
  return [
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,b,b,b,b,_,_,_,_,_,_],
    [_,_,_,_,_,b,b,w,w,b,b,_,_,_,_,_],
    [_,_,_,_,b,g,g,g,g,g,g,b,_,_,_,_],
    [_,_,_,b,g,g,d,g,g,d,g,g,b,_,_,_],
    [_,_,_,b,g,g,b,g,g,b,g,g,b,_,_,_],
    [_,_,b,g,g,g,g,g,g,g,g,g,g,b,_,_],
    [_,_,b,g,g,g,g,g,g,g,g,g,g,b,_,_],
    [_,_,b,d,g,g,g,a,a,g,g,g,d,b,_,_],
    [_,_,_,b,d,g,g,g,g,g,g,d,b,_,_,_],
    [_,_,_,_,b,d,d,d,d,d,d,b,_,_,_,_],
    [_,_,_,_,_,b,b,b,b,b,b,_,_,_,_,_],
    [_,_,_,_,_,_,b,_,_,b,_,_,_,_,_,_],
    [_,_,_,_,_,b,_,_,_,_,b,_,_,_,_,_],
    [_,_,_,_,b,_,_,_,_,_,_,b,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ];
}

function makeSentinelSprite() {
  // Stalker variant — armored sentinel with blue visor
  const _ = null;
  const s = 'sentinelBlue';
  const d = 'darkGray';
  const c = 'charcoal';
  const g = 'lightGray';
  const w = 'white';
  const b = 'psiBlue';
  return [
    [_,_,_,_,_,_,d,d,d,d,_,_,_,_,_,_],
    [_,_,_,_,_,d,c,c,c,c,d,_,_,_,_,_],
    [_,_,_,_,d,c,s,s,s,s,c,d,_,_,_,_],
    [_,_,_,d,c,s,s,s,s,s,s,c,d,_,_,_],
    [_,_,_,d,s,b,b,b,b,b,b,s,d,_,_,_],
    [_,_,_,d,c,s,s,s,s,s,s,c,d,_,_,_],
    [_,_,_,_,d,c,c,c,c,c,c,d,_,_,_,_],
    [_,_,_,d,d,d,g,g,g,g,d,d,d,_,_,_],
    [_,_,d,d,g,g,g,g,g,g,g,g,d,d,_,_],
    [_,_,d,g,g,g,d,g,g,d,g,g,g,d,_,_],
    [_,_,d,g,g,g,g,g,g,g,g,g,g,d,_,_],
    [_,_,_,d,g,g,g,g,g,g,g,g,d,_,_,_],
    [_,_,_,_,d,d,g,g,g,g,d,d,_,_,_,_],
    [_,_,_,_,d,_,d,d,d,d,_,d,_,_,_,_],
    [_,_,_,d,d,_,_,_,_,_,_,d,d,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ];
}

function makeVerifierSprite() {
  // Observer — floating cloaked eye with green scanner
  const _ = null;
  const v = 'verifierGreen';
  const g = 'lightGray';
  const d = 'darkGray';
  const c = 'charcoal';
  const b = 'psiBlue';
  const w = 'white';
  return [
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,b,b,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,b,b,b,b,_,_,_,_,_,_],
    [_,_,_,_,_,b,g,g,g,g,b,_,_,_,_,_],
    [_,_,_,_,b,g,g,g,g,g,g,b,_,_,_,_],
    [_,_,_,b,g,g,v,v,v,v,g,g,b,_,_,_],
    [_,_,b,g,g,v,v,w,w,v,v,g,g,b,_,_],
    [_,_,b,g,g,v,w,w,w,w,v,g,g,b,_,_],
    [_,_,b,g,g,v,v,w,w,v,v,g,g,b,_,_],
    [_,_,_,b,g,g,v,v,v,v,g,g,b,_,_,_],
    [_,_,_,_,b,g,g,g,g,g,g,b,_,_,_,_],
    [_,_,_,_,_,b,g,g,g,g,b,_,_,_,_,_],
    [_,_,_,_,_,_,b,b,b,b,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,v,v,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,v,_,_,v,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ];
}

function makeArchivistSprite() {
  // High Templar — robed figure with psi energy crown
  const _ = null;
  const a = 'archiveAmber';
  const p = 'psiBlue';
  const g = 'gold';
  const d = 'darkGray';
  const c = 'charcoal';
  const w = 'white';
  const l = 'lightGray';
  return [
    [_,_,_,_,_,g,_,_,_,_,g,_,_,_,_,_],
    [_,_,_,_,g,g,g,_,_,g,g,g,_,_,_,_],
    [_,_,_,_,_,g,g,g,g,g,g,_,_,_,_,_],
    [_,_,_,_,d,p,p,p,p,p,p,d,_,_,_,_],
    [_,_,_,d,p,p,p,p,p,p,p,p,d,_,_,_],
    [_,_,_,d,c,p,w,c,c,w,p,c,d,_,_,_],
    [_,_,_,d,c,c,c,c,c,c,c,c,d,_,_,_],
    [_,_,_,_,d,c,c,a,a,c,c,d,_,_,_,_],
    [_,_,_,_,_,d,c,c,c,c,d,_,_,_,_,_],
    [_,_,_,d,a,a,d,d,d,d,a,a,d,_,_,_],
    [_,_,d,a,a,a,a,a,a,a,a,a,a,d,_,_],
    [_,_,d,a,a,a,a,a,a,a,a,a,a,d,_,_],
    [_,_,_,d,a,a,a,a,a,a,a,a,d,_,_,_],
    [_,_,_,_,d,a,a,a,a,a,a,d,_,_,_,_],
    [_,_,_,_,_,d,d,d,d,d,d,_,_,_,_,_],
    [_,_,_,_,_,_,d,_,_,d,_,_,_,_,_,_],
  ];
}

function makeSynthSprite() {
  // Dark Templar — stealthy figure with void blades
  const _ = null;
  const s = 'synthShadow';
  const p = 'psiPurple';
  const g = 'psiPurpleGlow';
  const d = 'darkGray';
  const c = 'charcoal';
  const w = 'white';
  const b = 'black';
  return [
    [_,_,_,_,_,_,s,s,s,s,_,_,_,_,_,_],
    [_,_,_,_,_,s,s,s,s,s,s,_,_,_,_,_],
    [_,_,_,_,s,s,s,s,s,s,s,s,_,_,_,_],
    [_,_,_,s,s,s,s,s,s,s,s,s,s,_,_,_],
    [_,_,_,s,c,g,g,c,c,g,g,c,s,_,_,_],
    [_,_,_,s,c,c,c,c,c,c,c,c,s,_,_,_],
    [_,_,_,_,s,c,c,c,c,c,c,s,_,_,_,_],
    [_,_,_,_,_,s,c,c,c,c,s,_,_,_,_,_],
    [_,_,g,_,s,s,s,d,d,s,s,s,_,g,_,_],
    [_,g,g,s,s,d,d,d,d,d,d,s,s,g,g,_],
    [g,g,_,s,d,d,d,d,d,d,d,d,s,_,g,g],
    [g,_,_,s,d,d,d,d,d,d,d,d,s,_,_,g],
    [_,_,_,_,s,d,d,d,d,d,d,s,_,_,_,_],
    [_,_,_,_,_,s,s,d,d,s,s,_,_,_,_,_],
    [_,_,_,_,_,s,_,_,_,_,s,_,_,_,_,_],
    [_,_,_,_,s,s,_,_,_,_,s,s,_,_,_,_],
  ];
}

function makeEchoSprite() {
  // Artanis — hero commander with golden armor and psi blades
  const _ = null;
  const e = 'echoGold';
  const g = 'goldDark';
  const p = 'psiBlue';
  const d = 'darkGray';
  const c = 'charcoal';
  const w = 'white';
  const l = 'lightGray';
  return [
    [_,_,_,_,_,e,e,e,e,e,e,_,_,_,_,_],
    [_,_,_,_,e,e,e,e,e,e,e,e,_,_,_,_],
    [_,_,_,e,e,g,g,g,g,g,g,e,e,_,_,_],
    [_,_,_,e,g,g,g,g,g,g,g,g,e,_,_,_],
    [_,_,_,e,c,p,p,c,c,p,p,c,e,_,_,_],
    [_,_,_,e,c,c,c,c,c,c,c,c,e,_,_,_],
    [_,_,_,_,e,c,c,c,c,c,c,e,_,_,_,_],
    [_,_,_,_,_,e,c,c,c,c,e,_,_,_,_,_],
    [_,p,p,_,e,e,e,d,d,e,e,e,_,p,p,_],
    [_,_,p,e,e,g,g,g,g,g,g,e,e,p,_,_],
    [_,_,_,e,g,g,g,g,g,g,g,g,e,_,_,_],
    [_,_,_,e,g,g,g,e,e,g,g,g,e,_,_,_],
    [_,_,_,_,e,g,g,g,g,g,g,e,_,_,_,_],
    [_,_,_,_,_,e,e,g,g,e,e,_,_,_,_,_],
    [_,_,_,_,_,e,_,_,_,_,e,_,_,_,_,_],
    [_,_,_,_,e,e,_,_,_,_,e,e,_,_,_,_],
  ];
}

function makeNexusSprite() {
  // Nexus — crystalline structure, mission control hub
  const _ = null;
  const n = 'nexusCrystal';
  const p = 'psiBlue';
  const g = 'lightGray';
  const d = 'darkGray';
  const c = 'charcoal';
  const w = 'white';
  const b = 'psiBlueGlow';
  return [
    [_,_,_,_,_,_,_,p,p,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,p,w,w,p,_,_,_,_,_,_],
    [_,_,_,_,_,p,n,n,n,n,p,_,_,_,_,_],
    [_,_,_,_,p,n,n,n,n,n,n,p,_,_,_,_],
    [_,_,_,p,n,n,n,w,w,n,n,n,p,_,_,_],
    [_,_,p,n,n,n,w,w,w,w,n,n,n,p,_,_],
    [_,_,p,n,n,n,w,w,w,w,n,n,n,p,_,_],
    [_,p,n,n,n,n,n,w,w,n,n,n,n,n,p,_],
    [_,p,n,n,n,n,n,w,w,n,n,n,n,n,p,_],
    [_,_,p,n,n,n,n,n,n,n,n,n,n,p,_,_],
    [_,_,p,n,n,n,n,n,n,n,n,n,n,p,_,_],
    [_,_,_,p,n,n,n,n,n,n,n,n,p,_,_,_],
    [_,_,_,_,p,b,b,b,b,b,b,p,_,_,_,_],
    [_,_,_,_,_,p,b,b,b,b,p,_,_,_,_,_],
    [_,_,_,_,p,p,p,p,p,p,p,p,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ];
}

const SPRITE_MAP = {
  oracle:    makeOracleSprite,
  atlas:     makeAtlasSprite,
  sentinel:  makeSentinelSprite,
  verifier:  makeVerifierSprite,
  archivist: makeArchivistSprite,
  synth:     makeSynthSprite,
  echo:      makeEchoSprite,
  nexus:     makeNexusSprite,
};

// Agent display names (Protoss theme)
const AGENT_NAMES = {
  oracle:    'Zeratul',
  atlas:     'Probe',
  sentinel:  'Sentinel',
  verifier:  'Observer',
  archivist: 'High Templar',
  synth:     'Dark Templar',
  echo:      'Artanis',
  nexus:     'Nexus',
};

function spriteToCanvas(grid, palette, pixelSize) {
  const canvas = document.createElement('canvas');
  const rows = grid.length;
  const cols = grid[0].length;
  canvas.width = cols * pixelSize;
  canvas.height = rows * pixelSize;
  const ctx = canvas.getContext('2d');
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = grid[r][c];
      if (!key) continue;
      ctx.fillStyle = palette[key] || '#FF00FF';
      ctx.fillRect(c * pixelSize, r * pixelSize, pixelSize, pixelSize);
    }
  }
  return canvas;
}

const STYLE = `
:host {
  display: inline-block;
  position: relative;
}
.sprite-wrap {
  position: relative;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  transition: filter 0.3s, transform 0.3s;
}
.sprite-wrap canvas {
  display: block;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}
/* idle: subtle float */
:host([state="idle"]) .sprite-wrap {
  animation: sprite-float 3s ease-in-out infinite;
}
/* speaking: pulse glow + bounce */
:host([state="speaking"]) .sprite-wrap {
  animation: sprite-speak 0.6s ease-in-out infinite;
  filter: drop-shadow(0 0 8px var(--glow, #00E5FF));
}
/* processing: rotate shimmer */
:host([state="processing"]) .sprite-wrap {
  animation: sprite-process 1.2s linear infinite;
  filter: drop-shadow(0 0 6px var(--glow, #7C4DFF)) brightness(1.15);
}
@keyframes sprite-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
@keyframes sprite-speak {
  0%, 100% { transform: scale(1) translateY(0); }
  25% { transform: scale(1.05) translateY(-2px); }
  75% { transform: scale(0.98) translateY(1px); }
}
@keyframes sprite-process {
  0% { filter: drop-shadow(0 0 6px var(--glow, #7C4DFF)) brightness(1.0); }
  50% { filter: drop-shadow(0 0 12px var(--glow, #7C4DFF)) brightness(1.3); }
  100% { filter: drop-shadow(0 0 6px var(--glow, #7C4DFF)) brightness(1.0); }
}
.label {
  text-align: center;
  font-size: 10px;
  color: rgba(255,255,255,0.7);
  margin-top: 4px;
  font-family: 'JetBrains Mono', monospace;
  letter-spacing: 0.03em;
}
.status-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  position: absolute;
  bottom: 18px;
  right: 2px;
  border: 1px solid rgba(0,0,0,0.4);
}
.status-dot.active { background: #69F0AE; }
.status-dot.idle { background: #FFD740; }
.status-dot.rate-limited { background: #FF5252; }
.status-dot.paused { background: #78909C; }
`;

const GLOW_COLORS = {
  oracle:    '#9C27B0',
  atlas:     '#00E5FF',
  sentinel:  '#2979FF',
  verifier:  '#00E676',
  archivist: '#FFD740',
  synth:     '#7C4DFF',
  echo:      '#FFD700',
  nexus:     '#00BFA5',
};

export class AgentSprite extends HTMLElement {
  static get observedAttributes() { return ['agent', 'state', 'size', 'show-label', 'status']; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    // Prevent infinite loop: only re-render if meaningful attributes changed
    if (oldValue !== newValue && name !== 'state') {
      this.render();
    }
  }

  render() {
    const agent = this.getAttribute('agent') || 'oracle';
    const state = this.getAttribute('state') || 'idle';
    const size = parseInt(this.getAttribute('size') || '64');
    const showLabel = this.hasAttribute('show-label');
    const status = this.getAttribute('status') || '';
    const pixelSize = Math.max(1, Math.floor(size / 16));
    const actualSize = pixelSize * 16;

    const makeFn = SPRITE_MAP[agent];
    if (!makeFn) {
      this.shadowRoot.innerHTML = `<div style="width:${size}px;height:${size}px;background:#333;border-radius:4px;"></div>`;
      return;
    }

    const grid = makeFn();
    const glow = GLOW_COLORS[agent] || '#00E5FF';

    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <div class="sprite-wrap" style="--glow:${glow};width:${actualSize}px;height:${actualSize}px;">
        <div class="canvas-slot"></div>
        ${status ? `<div class="status-dot ${status}"></div>` : ''}
      </div>
      ${showLabel ? `<div class="label">${agent}</div>` : ''}
    `;

    // Set state attribute for CSS animations (won't trigger re-render now)
    if (this.getAttribute('state') !== state) {
      this.setAttribute('state', state);
    }

    const canvas = spriteToCanvas(grid, PALETTE, pixelSize);
    canvas.style.width = actualSize + 'px';
    canvas.style.height = actualSize + 'px';
    this.shadowRoot.querySelector('.canvas-slot').appendChild(canvas);
  }
}

customElements.define('agent-sprite', AgentSprite);

// Export for reuse
export { PALETTE, SPRITE_MAP, AGENT_NAMES, GLOW_COLORS, spriteToCanvas };
