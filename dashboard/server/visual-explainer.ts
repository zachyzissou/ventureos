/**
 * Visual Explainer Canvas Skill (Issue #226)
 *
 * Builds interactive HTML fragments for complex explanations.
 */

export type VisualPatternType = 'table' | 'flow' | 'timeline' | 'hierarchy' | 'comparison';

export interface VisualExplainerInput {
  command: string;
  title?: string;
  pattern?: VisualPatternType;
}

export interface VisualExplainerRenderResult {
  html: string;
  pattern: VisualPatternType;
  title: string;
  renderTimeMs: number;
}

export interface ParsedVisualCommand {
  mode: 'explain' | 'visualize';
  subject: string;
  requestedPattern?: VisualPatternType;
}

const PATTERNS: VisualPatternType[] = ['table', 'flow', 'timeline', 'hierarchy', 'comparison'];

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slug(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'topic';
}

function splitSubject(subject: string): string[] {
  return subject
    .split(/[,|>]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parseVisualCommand(commandRaw: string): ParsedVisualCommand | null {
  const command = commandRaw.trim();
  if (!command.startsWith('/')) return null;
  const explainMatch = command.match(/^\/explain\s+(.+)$/i);
  if (explainMatch) {
    return {
      mode: 'explain',
      subject: explainMatch[1].trim(),
    };
  }
  const visualizeMatch = command.match(/^\/visualize\s+(.+)$/i);
  if (visualizeMatch) {
    const body = visualizeMatch[1].trim();
    const patternMatch = body.match(/\s+--pattern=(table|flow|timeline|hierarchy|comparison)\s*$/i);
    return {
      mode: 'visualize',
      subject: patternMatch ? body.replace(patternMatch[0], '').trim() : body,
      requestedPattern: patternMatch ? patternMatch[1].toLowerCase() as VisualPatternType : undefined,
    };
  }
  return null;
}

export function listVisualPatterns(): VisualPatternType[] {
  return [...PATTERNS];
}

function pickPattern(parsed: ParsedVisualCommand | null, forced?: VisualPatternType): VisualPatternType {
  if (forced) return forced;
  if (parsed?.requestedPattern) return parsed.requestedPattern;
  if (parsed?.mode === 'explain') return 'hierarchy';
  return 'flow';
}

function buildTablePattern(subject: string): string {
  const entries = splitSubject(subject);
  const rows = (entries.length > 0 ? entries : ['Context', 'Signal', 'Action']).map((entry, index) => `
      <tr>
        <td class="mono">S${index + 1}</td>
        <td>${escapeHtml(entry)}</td>
        <td><span class="tip" data-tip="Convert this signal into an explicit next action.">Interpretation</span></td>
      </tr>
  `).join('');
  return `
    <section class="card">
      <h3>Signal Table</h3>
      <table>
        <thead><tr><th>ID</th><th>Signal</th><th>Meaning</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

function buildFlowPattern(subject: string): string {
  const steps = splitSubject(subject);
  const nodes = (steps.length > 0 ? steps : ['Input', 'Transform', 'Decision', 'Output']).map((step, index) => `
      <div class="flow-node">
        <div class="flow-index">${index + 1}</div>
        <div><span class="tip" data-tip="Step ${index + 1}: align this transition before advancing.">${escapeHtml(step)}</span></div>
      </div>
      ${index < (steps.length > 0 ? steps.length : 4) - 1 ? '<div class="flow-arrow">→</div>' : ''}
  `).join('');
  return `
    <section class="card">
      <h3>Flow</h3>
      <div class="flow-wrap">${nodes}</div>
    </section>
  `;
}

function buildTimelinePattern(subject: string): string {
  const events = splitSubject(subject);
  const items = (events.length > 0 ? events : ['Now', 'Next', 'Soon', 'Later']).map((event, index) => `
      <li>
        <span class="time-dot"></span>
        <div>
          <div class="mono">T+${index}</div>
          <div>${escapeHtml(event)}</div>
        </div>
      </li>
  `).join('');
  return `
    <section class="card">
      <h3>Timeline</h3>
      <ol class="timeline">${items}</ol>
    </section>
  `;
}

function buildHierarchyPattern(subject: string): string {
  const nodes = splitSubject(subject);
  const safe = nodes.length > 0 ? nodes : ['Goal', 'Strategy', 'Execution'];
  const children = safe.slice(1).map((entry) => `<li>${escapeHtml(entry)}</li>`).join('');
  return `
    <section class="card">
      <h3>Hierarchy</h3>
      <details open>
        <summary>${escapeHtml(safe[0])}</summary>
        <ul class="hierarchy">${children}</ul>
      </details>
    </section>
  `;
}

function buildComparisonPattern(subject: string): string {
  const entries = splitSubject(subject);
  const left = entries[0] ?? 'Option A';
  const right = entries[1] ?? 'Option B';
  return `
    <section class="card comparison">
      <h3>Comparison</h3>
      <div class="compare-grid">
        <article>
          <h4>${escapeHtml(left)}</h4>
          <p class="tip" data-tip="Strengths, risks, and resource profile for this path.">Profile</p>
        </article>
        <article>
          <h4>${escapeHtml(right)}</h4>
          <p class="tip" data-tip="Contrast this option against the left side.">Profile</p>
        </article>
      </div>
    </section>
  `;
}

function renderPattern(pattern: VisualPatternType, subject: string): string {
  if (pattern === 'table') return buildTablePattern(subject);
  if (pattern === 'flow') return buildFlowPattern(subject);
  if (pattern === 'timeline') return buildTimelinePattern(subject);
  if (pattern === 'hierarchy') return buildHierarchyPattern(subject);
  return buildComparisonPattern(subject);
}

export function renderVisualExplainer(input: VisualExplainerInput): VisualExplainerRenderResult {
  const started = Date.now();
  const parsed = parseVisualCommand(input.command);
  const subject = parsed?.subject ?? input.command.trim();
  const pattern = pickPattern(parsed, input.pattern);
  const title = input.title?.trim() || subject || 'Visual Explainer';

  const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --bg: #070b14;
      --panel: #11192b;
      --line: #21314a;
      --text: #e8f1ff;
      --muted: #8ba3c7;
      --accent: #18d4a3;
      --accent2: #4fa3ff;
    }
    body { margin:0; padding:20px; background:radial-gradient(circle at 0% 0%, #10203e, var(--bg)); color:var(--text); font-family: "IBM Plex Sans", sans-serif; }
    h1 { margin: 0 0 14px; font-size: 24px; }
    h3 { margin: 0 0 12px; font-size: 17px; color: var(--accent); }
    .meta { color: var(--muted); margin-bottom: 14px; font-size: 13px; }
    .card { border:1px solid var(--line); border-radius: 14px; background: linear-gradient(180deg, #121d33, #0e1627); padding: 14px; box-shadow: 0 18px 50px rgba(0,0,0,.22); }
    .mono { font-family: "JetBrains Mono", monospace; font-size: 12px; color: var(--muted); }
    .tip { border-bottom: 1px dashed var(--accent2); cursor: help; position: relative; }
    .tip:hover::after {
      content: attr(data-tip);
      position: absolute;
      top: 100%;
      left: 0;
      margin-top: 6px;
      background: #0b1322;
      border: 1px solid var(--line);
      color: var(--text);
      padding: 6px 8px;
      border-radius: 8px;
      font-size: 12px;
      width: 220px;
      z-index: 2;
    }
    table { width:100%; border-collapse: collapse; font-size: 14px; }
    th, td { border-bottom: 1px solid var(--line); text-align: left; padding: 8px 6px; }
    .flow-wrap { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
    .flow-node { border:1px solid var(--line); background:#0b1424; border-radius:10px; padding:10px 12px; display:flex; gap:8px; align-items:center; }
    .flow-index { background:var(--accent2); color:#001933; font-weight:700; border-radius:999px; width:22px; height:22px; display:flex; align-items:center; justify-content:center; font-size:12px; }
    .flow-arrow { color:var(--accent); font-size:20px; }
    .timeline { list-style:none; padding:0; margin:0; display:grid; gap:10px; }
    .timeline li { display:flex; gap:10px; align-items:flex-start; }
    .time-dot { width:10px; height:10px; margin-top:4px; border-radius:50%; background:var(--accent); box-shadow:0 0 0 4px rgba(24,212,163,.2); }
    .hierarchy { margin-top:10px; display:grid; gap:6px; }
    .compare-grid { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:10px; }
    .compare-grid article { border:1px solid var(--line); border-radius:10px; padding:10px; background:#0b1424; }
    @media (max-width: 760px) { .compare-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">Pattern: <span class="mono">${pattern}</span> · Generated from command <span class="mono">${escapeHtml(input.command)}</span></div>
  ${renderPattern(pattern, subject)}
  <details style="margin-top:12px">
    <summary>Pattern Library</summary>
    <p class="mono">${PATTERNS.join(' · ')}</p>
  </details>
</body>
</html>
  `.trim();

  return {
    html,
    pattern,
    title,
    renderTimeMs: Math.max(0, Date.now() - started),
  };
}
