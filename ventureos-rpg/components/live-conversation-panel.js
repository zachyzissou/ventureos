/**
 * <live-conversation-panel> — Real-time Multi-Agent Conversation Display
 * 
 * Shows live conversation feed with:
 * - Agent message timeline (chronological, grouped by speaker)
 * - Fact vs Action visual separation
 * - Turn indicator (who's speaking, who's queued)
 * - Participant sidebar with sprites + status
 * - Affinity visualizer for active participants
 * - Voice RULES violation highlighting
 * - Injection score risk indicators
 * 
 * Usage:
 *   <live-conversation-panel></live-conversation-panel>
 * 
 * Attributes:
 *   api-base  — API base URL (default: '' = same origin)
 *   poll-ms   — polling interval in ms (default: 3000)
 *   max-messages — max messages to display (default: 100)
 */

import { AGENT_NAMES, GLOW_COLORS } from './agent-sprites.js';

const AGENT_COLORS = {
  oracle:    { bg: 'rgba(156, 39, 176, 0.12)', border: '#9C27B0', text: '#CE93D8' },
  atlas:     { bg: 'rgba(0, 229, 255, 0.10)', border: '#00E5FF', text: '#80DEEA' },
  sentinel:  { bg: 'rgba(41, 121, 255, 0.10)', border: '#2979FF', text: '#90CAF9' },
  verifier:  { bg: 'rgba(0, 230, 118, 0.10)', border: '#00E676', text: '#A5D6A7' },
  archivist: { bg: 'rgba(255, 111, 0, 0.10)', border: '#FF6F00', text: '#FFCC80' },
  synth:     { bg: 'rgba(124, 77, 255, 0.10)', border: '#7C4DFF', text: '#B39DDB' },
  echo:      { bg: 'rgba(255, 215, 0, 0.10)', border: '#FFD700', text: '#FFF176' },
  nexus:     { bg: 'rgba(0, 191, 165, 0.10)', border: '#00BFA5', text: '#80CBC4' },
};

const STYLE = `
:host {
  display: block;
  font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;
  --protoss-cyan: #00E5FF;
  --panel-bg: rgba(0,0,0,0.25);
  --panel-border: rgba(255,255,255,0.14);
  --text: rgba(255,255,255,0.92);
  --muted: rgba(255,255,255,0.55);
  --bg-card: #1f1f2e;
  --bg-secondary: #13131a;
  --border: #2a2a3a;
}

.conversation-wrap {
  border: 1px solid var(--panel-border);
  background: linear-gradient(180deg, rgba(0,229,255,0.03), rgba(124,77,255,0.02));
  border-radius: 14px;
  overflow: hidden;
}

/* Header */
.conv-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
  background: rgba(0,0,0,0.2);
}
.conv-header h3 {
  margin: 0;
  font-size: 14px;
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 8px;
}
.live-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #69F0AE;
  animation: live-pulse 2s ease-in-out infinite;
}
.live-dot.inactive { background: #78909C; animation: none; }
@keyframes live-pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(105,240,174,0.6); }
  50% { opacity: 0.7; box-shadow: 0 0 0 6px rgba(105,240,174,0); }
}
.conv-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}
.conv-controls select, .conv-controls button {
  background: rgba(255,255,255,0.06);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 11px;
  cursor: pointer;
}
.conv-controls button:hover { background: rgba(255,255,255,0.12); }

/* Layout: sidebar + feed */
.conv-body {
  display: flex;
  min-height: 420px;
  max-height: 600px;
}

/* Participant sidebar */
.participants {
  width: 160px;
  min-width: 160px;
  border-right: 1px solid var(--border);
  padding: 12px 10px;
  background: rgba(0,0,0,0.15);
  overflow-y: auto;
}
.participant {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
  margin-bottom: 4px;
}
.participant:hover { background: rgba(255,255,255,0.06); }
.participant.speaking { background: rgba(0,229,255,0.08); }
.participant.queued { opacity: 0.7; }
.participant-info {
  flex: 1;
  min-width: 0;
}
.participant-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.participant-status {
  font-size: 9px;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 4px;
}
.turn-badge {
  font-size: 9px;
  background: rgba(0,229,255,0.2);
  color: #00E5FF;
  padding: 1px 5px;
  border-radius: 4px;
  font-weight: 600;
}
.turn-badge.queued {
  background: rgba(255,215,0,0.15);
  color: #FFD740;
}

/* Affinity mini section */
.affinity-section {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}
.affinity-section h4 {
  font-size: 10px;
  color: var(--muted);
  margin: 0 0 6px 0;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.affinity-pair {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 3px;
  font-size: 9px;
  color: var(--muted);
}
.affinity-bar {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: rgba(255,255,255,0.08);
  overflow: hidden;
}
.affinity-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.5s ease;
}
.affinity-val { width: 28px; text-align: right; font-variant-numeric: tabular-nums; }

/* Message feed */
.message-feed {
  flex: 1;
  padding: 12px 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  scroll-behavior: smooth;
}

.msg-group {
  display: flex;
  gap: 10px;
  padding: 8px 0;
}
.msg-group + .msg-group {
  border-top: 1px solid rgba(255,255,255,0.04);
}
.msg-sprite {
  flex-shrink: 0;
  padding-top: 2px;
}
.msg-content {
  flex: 1;
  min-width: 0;
}
.msg-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 4px;
}
.msg-agent {
  font-size: 12px;
  font-weight: 600;
}
.msg-protoss {
  font-size: 10px;
  color: var(--muted);
}
.msg-time {
  font-size: 10px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  margin-left: auto;
}

.msg-body {
  font-size: 12px;
  color: var(--text);
  line-height: 1.6;
  word-break: break-word;
}

/* Fact vs Action badges */
.msg-type-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 600;
  margin-right: 6px;
  vertical-align: middle;
}
.msg-type-badge.fact {
  background: rgba(0, 229, 255, 0.12);
  color: #00E5FF;
}
.msg-type-badge.action {
  background: rgba(255, 171, 64, 0.12);
  color: #FFAB40;
}
.msg-type-badge.decision {
  background: rgba(105, 240, 174, 0.12);
  color: #69F0AE;
}
.msg-type-badge.question {
  background: rgba(124, 77, 255, 0.12);
  color: #B39DDB;
}

/* Voice RULES violation */
.voice-violation {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255, 82, 82, 0.12);
  color: #FF5252;
  margin-top: 4px;
}

/* Injection score */
.injection-score {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 4px;
  margin-top: 4px;
  margin-left: 6px;
}
.injection-score.low { background: rgba(105,240,174,0.10); color: #69F0AE; }
.injection-score.medium { background: rgba(255,215,0,0.12); color: #FFD740; }
.injection-score.high { background: rgba(255,152,0,0.12); color: #FFA726; }
.injection-score.critical { background: rgba(255,82,82,0.15); color: #FF5252; }

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--muted);
  gap: 12px;
  padding: 40px;
  text-align: center;
}
.empty-icon { font-size: 40px; opacity: 0.4; }
.empty-text { font-size: 13px; }

/* Typing indicator */
.typing-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 11px;
  color: var(--muted);
  border-top: 1px solid rgba(255,255,255,0.04);
}
.typing-dots {
  display: flex;
  gap: 3px;
}
.typing-dots span {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: var(--muted);
  animation: typing-bounce 1.4s ease-in-out infinite;
}
.typing-dots span:nth-child(2) { animation-delay: 0.2s; }
.typing-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes typing-bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-4px); opacity: 1; }
}

/* Mobile responsive */
@media (max-width: 640px) {
  .conv-body { flex-direction: column; }
  .participants {
    width: 100%;
    min-width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--border);
    max-height: 120px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 8px;
  }
  .participant { padding: 4px; }
  .affinity-section { display: none; }
  .msg-sprite { display: none; }
  .conv-body { max-height: 500px; }
}

/* Conversation selector dropdown */
.conv-selector {
  font-size: 11px;
  max-width: 180px;
}

/* Scroll anchor */
.scroll-anchor { height: 1px; }
`;

// Demo data for when no API is available
function generateDemoData() {
  const agents = ['oracle', 'atlas', 'sentinel', 'verifier', 'archivist', 'synth', 'echo', 'nexus'];
  const messages = [
    { agent: 'nexus', type: 'action', text: 'Initiating Phase 4 Track 5 coordination. All agents, report readiness for conversation orchestration integration.', violations: [], injectionScore: 0 },
    { agent: 'echo', type: 'decision', text: 'Track 5 greenlit. Oracle leads UI/visualization, Synth handles engine core. Deadline: Week 7.', violations: [], injectionScore: 0 },
    { agent: 'oracle', type: 'fact', text: 'Dashboard architecture confirmed: Web Components on vanilla JS, served from port 7001. Existing Pylon Network components operational.', violations: [], injectionScore: 0 },
    { agent: 'synth', type: 'action', text: 'Conversation engine schema drafted. Proposing WebSocket endpoint at /ws/conversations for real-time message streaming.', violations: [], injectionScore: 0 },
    { agent: 'sentinel', type: 'fact', text: 'Security review of conversation endpoints: injection scoring pipeline ready. All messages will be scanned before display.', violations: [], injectionScore: 0 },
    { agent: 'verifier', type: 'fact', text: 'Validation checks configured for message format. Schema: { agent, type, text, timestamp, metadata }. No anomalies in test payloads.', violations: [], injectionScore: 0.1 },
    { agent: 'archivist', type: 'fact', text: 'Historical conversation data indexed. 847 cross-agent interactions logged in Khala Network since Phase 2 launch.', violations: [], injectionScore: 0 },
    { agent: 'atlas', type: 'action', text: 'Infrastructure provisioned for WebSocket server. Memory allocation: 128MB reserved. Connection pool: 50 max concurrent.', violations: [], injectionScore: 0 },
    { agent: 'oracle', type: 'action', text: 'Sprite system complete: 8 agents × 3 animation states. CSS pixel art at 64×64 resolution with Protoss theming.', violations: [], injectionScore: 0 },
    { agent: 'sentinel', type: 'fact', text: 'Injection scoring thresholds set: <0.3 safe, 0.3-0.6 warning, 0.6-0.8 elevated, >0.8 critical. Color-coded in UI.', violations: [], injectionScore: 0 },
    { agent: 'synth', type: 'question', text: 'Should affinity drift events trigger visual notifications in the conversation panel? Proposing subtle bond-strength animations.', violations: [], injectionScore: 0 },
    { agent: 'echo', type: 'decision', text: 'Approved. Affinity changes should be visible but non-intrusive. Use the existing Khala color scheme for consistency.', violations: [], injectionScore: 0 },
  ];

  const now = Date.now();
  return {
    id: 'conv-demo-001',
    title: 'Phase 4 Track 5 Coordination',
    status: 'active',
    participants: agents.map((a, i) => ({
      agent: a,
      status: i < 3 ? 'active' : (i < 6 ? 'idle' : 'active'),
      lastActive: new Date(now - i * 30000).toISOString(),
    })),
    messages: messages.map((m, i) => ({
      id: `msg-${i}`,
      ...m,
      timestamp: new Date(now - (messages.length - i) * 45000).toISOString(),
    })),
    currentSpeaker: 'echo',
    queue: ['oracle', 'synth'],
    affinities: [
      { a: 'oracle', b: 'archivist', value: 0.80 },
      { a: 'sentinel', b: 'verifier', value: 0.85 },
      { a: 'oracle', b: 'verifier', value: 0.80 },
      { a: 'echo', b: 'nexus', value: 0.75 },
      { a: 'synth', b: 'archivist', value: 0.65 },
      { a: 'atlas', b: 'sentinel', value: 0.70 },
      { a: 'sentinel', b: 'synth', value: 0.40 },
      { a: 'oracle', b: 'synth', value: 0.60 },
    ],
  };
}

export class LiveConversationPanel extends HTMLElement {
  static get observedAttributes() { return ['api-base', 'poll-ms', 'max-messages']; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._data = null;
    this._pollTimer = null;
    this._autoScroll = true;
    this._conversations = [];
    this._activeConvId = null;
  }

  /**
   * Escape HTML special characters to prevent XSS injection.
   * All user-controlled or API-sourced strings MUST pass through this
   * before being interpolated into innerHTML template literals.
   *
   * QA-002 fix: https://github.com/zachyzissou/ventureos/issues/QA-002
   */
  _escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  connectedCallback() {
    this.render();
    this._startPolling();
  }

  disconnectedCallback() {
    this._stopPolling();
  }

  attributeChangedCallback() {
    this._stopPolling();
    this._startPolling();
  }

  get apiBase() { return this.getAttribute('api-base') || ''; }
  get pollMs() { return parseInt(this.getAttribute('poll-ms') || '3000'); }
  get maxMessages() { return parseInt(this.getAttribute('max-messages') || '100'); }

  async _fetchData() {
    try {
      // Try to fetch from conversation API
      const listRes = await fetch(`${this.apiBase}/api/rpg/conversations/active`);
      if (listRes.ok) {
        const listData = await listRes.json();
        if (listData.ok && listData.conversations?.length) {
          this._conversations = listData.conversations;
          if (!this._activeConvId) {
            this._activeConvId = listData.conversations[0].id;
          }
          // Fetch active conversation details
          const convRes = await fetch(`${this.apiBase}/api/rpg/conversations/${this._activeConvId}`);
          if (convRes.ok) {
            const convData = await convRes.json();
            if (convData.ok) {
              this._data = convData.conversation;
              this._updateUI();
              return;
            }
          }
        }
      }
    } catch (e) {
      // API not available — use demo data
    }

    // Fallback to demo data
    if (!this._data) {
      this._data = generateDemoData();
      this._updateUI();
    }
  }

  _startPolling() {
    this._fetchData();
    this._pollTimer = setInterval(() => this._fetchData(), this.pollMs);
  }

  _stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  _updateUI() {
    if (!this._data) return;
    const data = this._data;

    // Update participants
    const partList = this.shadowRoot.querySelector('.participants-list');
    if (partList) {
      partList.innerHTML = this._renderParticipants(data);
    }

    // Update affinity
    const affSection = this.shadowRoot.querySelector('.affinity-list');
    if (affSection) {
      affSection.innerHTML = this._renderAffinities(data);
    }

    // Update messages
    const feed = this.shadowRoot.querySelector('.message-feed');
    if (feed) {
      const wasScrolledToBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 40;
      feed.innerHTML = this._renderMessages(data) + '<div class="scroll-anchor"></div>';
      if (this._autoScroll && wasScrolledToBottom) {
        feed.scrollTop = feed.scrollHeight;
      }
    }

    // Update typing indicator — escape speaker name (API-sourced)
    const typing = this.shadowRoot.querySelector('.typing-indicator');
    if (typing) {
      if (data.currentSpeaker) {
        typing.style.display = 'flex';
        typing.innerHTML = `
          <div class="typing-dots"><span></span><span></span><span></span></div>
          <span><strong>${this._escapeHtml(data.currentSpeaker)}</strong> is composing...</span>
        `;
      } else {
        typing.style.display = 'none';
      }
    }

    // Update header — textContent is already safe (no innerHTML)
    const title = this.shadowRoot.querySelector('.conv-title');
    if (title) title.textContent = data.title || 'Live Conversation';

    const liveDot = this.shadowRoot.querySelector('.live-dot');
    if (liveDot) {
      liveDot.classList.toggle('inactive', data.status !== 'active');
    }

    // Update conversation selector dropdown — escape titles and IDs
    const selector = this.shadowRoot.querySelector('.conv-selector');
    if (selector && this._conversations.length) {
      selector.innerHTML = this._conversations.map(c =>
        `<option value="${this._escapeHtml(c.id)}" ${c.id === this._activeConvId ? 'selected' : ''}>${this._escapeHtml(c.title || c.id)}</option>`
      ).join('');
    } else if (selector && data.id) {
      selector.innerHTML = `<option value="${this._escapeHtml(data.id)}" selected>${this._escapeHtml(data.title || data.id)}</option>`;
    }
  }

  _renderParticipants(data) {
    if (!data.participants?.length) return '<div class="empty-text" style="font-size:10px;color:var(--muted);padding:8px;">No participants</div>';

    return data.participants.map(p => {
      const isSpeaking = data.currentSpeaker === p.agent;
      const isQueued = data.queue?.includes(p.agent);
      const colors = AGENT_COLORS[p.agent] || {};

      const safeAgent = this._escapeHtml(p.agent);
      const safeStatus = this._escapeHtml(p.status);
      return `
        <div class="participant ${isSpeaking ? 'speaking' : ''} ${isQueued ? 'queued' : ''}">
          <agent-sprite agent="${safeAgent}" state="${isSpeaking ? 'speaking' : (safeStatus === 'active' ? 'idle' : 'idle')}" size="32" status="${safeStatus}"></agent-sprite>
          <div class="participant-info">
            <div class="participant-name" style="color:${colors.text || 'var(--text)'}">${safeAgent}</div>
            <div class="participant-status">
              ${isSpeaking ? '<span class="turn-badge">SPEAKING</span>' : ''}
              ${isQueued ? '<span class="turn-badge queued">QUEUED</span>' : ''}
              ${!isSpeaking && !isQueued ? `<span>${safeStatus}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  _renderAffinities(data) {
    if (!data.affinities?.length) return '';

    return data.affinities.slice(0, 6).map(af => {
      const pct = Math.round(af.value * 100);
      const hue = af.value > 0.7 ? '165' : af.value > 0.5 ? '45' : '0';
      const safeA = this._escapeHtml(String(af.a).slice(0,3));
      const safeB = this._escapeHtml(String(af.b).slice(0,3));
      return `
        <div class="affinity-pair">
          <span>${safeA}</span>
          <div class="affinity-bar">
            <div class="affinity-fill" style="width:${pct}%;background:hsl(${hue},80%,55%);"></div>
          </div>
          <span>${safeB}</span>
          <span class="affinity-val">${af.value.toFixed(2)}</span>
        </div>
      `;
    }).join('');
  }

  _renderMessages(data) {
    if (!data.messages?.length) {
      return `
        <div class="empty-state">
          <div class="empty-icon">🌀</div>
          <div class="empty-text">Awaiting Khala transmission...</div>
          <div class="empty-text" style="font-size:11px;">Conversation messages will appear here in real-time</div>
        </div>
      `;
    }

    // Group consecutive messages from same agent
    const groups = [];
    let currentGroup = null;

    for (const msg of data.messages.slice(-this.maxMessages)) {
      if (currentGroup && currentGroup.agent === msg.agent) {
        currentGroup.messages.push(msg);
      } else {
        currentGroup = { agent: msg.agent, messages: [msg] };
        groups.push(currentGroup);
      }
    }

    return groups.map(group => {
      const colors = AGENT_COLORS[group.agent] || {};
      const protossName = AGENT_NAMES[group.agent] || '';
      const safeGroupAgent = this._escapeHtml(group.agent);
      const safeProtossName = this._escapeHtml(protossName);

      const messagesHtml = group.messages.map(msg => {
        const time = new Date(msg.timestamp);
        const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

        // Escape message type — only allow known values for CSS class
        const safeType = ['fact', 'action', 'decision', 'question'].includes(msg.type) ? msg.type : '';

        // Type badge (icon from constant map, type already validated)
        const typeBadge = safeType ? `<span class="msg-type-badge ${safeType}">${this._typeIcon(safeType)} ${safeType}</span>` : '';

        // *** QA-002 FIX: Escape message text to prevent XSS injection ***
        const safeText = this._escapeHtml(msg.text);

        // Voice violations — escape each violation string
        const violationsHtml = msg.violations?.length
          ? msg.violations.map(v => `<div class="voice-violation">⚠️ ${this._escapeHtml(v)}</div>`).join('')
          : '';

        // Injection score (numeric — coerce to number for safety)
        let injHtml = '';
        const score = Number(msg.injectionScore);
        if (!isNaN(score) && score > 0) {
          const level = score >= 0.8 ? 'critical' : score >= 0.6 ? 'high' : score >= 0.3 ? 'medium' : 'low';
          injHtml = `<span class="injection-score ${level}">🛡️ ${(score * 100).toFixed(0)}%</span>`;
        }

        return `
          <div class="msg-entry">
            <div class="msg-header">
              <span class="msg-agent" style="color:${colors.text || 'var(--text)'}">${safeGroupAgent}</span>
              <span class="msg-protoss">${safeProtossName}</span>
              <span class="msg-time">${timeStr}</span>
            </div>
            <div class="msg-body">
              ${typeBadge}${safeText}
            </div>
            ${violationsHtml}${injHtml}
          </div>
        `;
      }).join('');

      return `
        <div class="msg-group" style="border-left:2px solid ${colors.border || 'var(--border)'}; padding-left:10px;">
          <div class="msg-sprite">
            <agent-sprite agent="${safeGroupAgent}" state="idle" size="36"></agent-sprite>
          </div>
          <div class="msg-content">
            ${messagesHtml}
          </div>
        </div>
      `;
    }).join('');
  }

  _typeIcon(type) {
    switch (type) {
      case 'fact': return '📋';
      case 'action': return '⚡';
      case 'decision': return '✅';
      case 'question': return '❓';
      default: return '💬';
    }
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <div class="conversation-wrap">
        <div class="conv-header">
          <h3>
            <div class="live-dot"></div>
            <span class="conv-title">Live Conversation</span>
          </h3>
          <div class="conv-controls">
            <select class="conv-selector" title="Select conversation">
              <option value="">Loading...</option>
            </select>
            <button class="btn-scroll" title="Scroll to bottom">↓</button>
          </div>
        </div>

        <div class="conv-body">
          <div class="participants">
            <div class="participants-list"></div>
            <div class="affinity-section">
              <h4>Khala Bonds</h4>
              <div class="affinity-list"></div>
            </div>
          </div>

          <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
            <div class="message-feed"></div>
            <div class="typing-indicator" style="display:none;"></div>
          </div>
        </div>
      </div>
    `;

    // Scroll-to-bottom button
    this.shadowRoot.querySelector('.btn-scroll')?.addEventListener('click', () => {
      const feed = this.shadowRoot.querySelector('.message-feed');
      if (feed) {
        feed.scrollTop = feed.scrollHeight;
        this._autoScroll = true;
      }
    });

    // Track if user scrolled up (disable auto-scroll)
    const feed = this.shadowRoot.querySelector('.message-feed');
    feed?.addEventListener('scroll', () => {
      const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 40;
      this._autoScroll = atBottom;
    });

    // Conversation selector
    this.shadowRoot.querySelector('.conv-selector')?.addEventListener('change', (e) => {
      if (e.target.value) {
        this._activeConvId = e.target.value;
        this._data = null;
        this._fetchData();
      }
    });
  }
}

customElements.define('live-conversation-panel', LiveConversationPanel);
