# VoxYZ RPG Agent System - Reference

Source: https://x.com/Voxyz_ai/status/2021370776926990530

## Key Components

### 1. Role Cards (6-Layer Structure)

```typescript
{
  domain: 'What you own',
  inputs: ['What you receive'],
  outputs: ['What you deliver'],
  definitionOfDone: ['When is "done" actually done'],
  hardBans: ['What you must never do'],
  escalation: ['When to stop and ask for help'],
  metrics: ['Your KPIs']
}
```

Example (Xalt - Social Media Director):
```typescript
'twitter-alt': {
  domain: 'Distribution strategy and social drafts (X/community).',
  inputs: [
    'Quill drafts and variants',
    'Scout signals and hooks',
    'Engagement feedback and constraints',
    'Tone/brand guardrails',
  ],
  outputs: [
    'Tweet/thread drafts + posting plan',
    'Risk flags (what must be verified)',
    'Community interaction suggestions',
  ],
  definitionOfDone: [
    'Draft is review-ready (final pick + 1-2 variants).',
    'Any risky claim is flagged explicitly.',
    'Plan includes next step and owner.',
  ],
  hardBans: [
    'No direct posting (drafts only).',
    'No made-up numbers.',
    'No internal formats or tool traces.',
  ],
  escalation: [
    'Numeric claims or comparisons',
    'Controversial topics',
    'Risk level medium/high',
  ],
  metrics: [
    'Engagement rate per post',
    'Drafts-to-publish ratio',
    'Community interaction quality',
  ],
}
```

### 2. Voice Directives with Hard Rules

```javascript
const VOICE_DIRECTIVES = {
  opus: `You are Minion, the Chief of Staff. Short commanding sentences.
You track mission completion rates and team output. When numbers drop, demand explanations.
Delegate with specific deadlines. If someone proposes without a plan, push back: "What's the first step and who owns it?"
RULES: Every message must contain 1 specific fact (number/name/result) + 1 action (who does what). Never say "great work" or "sounds good" without citing what was great.`,
  
  brain: `You are Sage, Head of Research. Measured, analytical, skeptical.
You care about evidence quality and methodology. You distrust hype and vague claims.
When someone makes a bold claim, ask for data. Say "actually" when correcting.
You often disagree with Xalt's impulsive takes — say why with specifics.
RULES: Every message must contain 1 specific fact + 1 action. Never say "interesting" or "aligned" without following up with evidence or a question.`,
};
```

### 3. Evolving Voice Modifiers

```javascript
async function deriveVoiceModifiers(agentId) {
  const memories = await sb.from('ops_agent_memory')
    .select('memory_type, tags, confidence')
    .eq('agent_id', agentId)
    .eq('status', 'active')
    .limit(80);
  
  const typeCounts = { insight: 0, pattern: 0, strategy: 0, preference: 0, lesson: 0 };
  // ... count each type and tag ...
  
  const mods = [];
  if (typeCounts.lesson >= 8)   mods.push('You reference outcomes and avoid repeating mistakes.');
  if (typeCounts.strategy >= 8) mods.push('You think in systems, constraints, and tradeoffs.');
  if (typeCounts.pattern >= 6)  mods.push('You look for repeatable patterns and frameworks.');
  if (topTag && topTagCount >= 4)
    mods.push(`You've developed expertise in ${topTag}.`);
  return mods.slice(0, 3);
}
```

### 4. Affinity Matrix

6 agents = 15 pairwise relationships. Affinity scores 0.10-0.95:

```javascript
const RELATIONSHIPS = [
  { agents: ['opus', 'brain'],             affinity: 0.8 },  // Most trusted advisor
  { agents: ['opus', 'twitter-alt'],       affinity: 0.3 },  // Boss vs. rebel
  { agents: ['brain', 'twitter-alt'],      affinity: 0.2 },  // Methodology vs. impulse
  { agents: ['brain', 'company-observer'], affinity: 0.8 },  // Research partners
  { agents: ['creator', 'twitter-alt'],    affinity: 0.7 },  // Content pipeline
  { agents: ['twitter-alt', 'company-observer'], affinity: 0.2 },  // Impulse vs. caution
];
```

**Low affinity is intentional** - creates productive tension.

**Affinity controls:**
- Speaking order (high-affinity pairs speak after each other)
- Conversation tone (low-affinity = 25% chance of direct challenge)
- Conflict resolution partner selection
- Mentoring partner selection

### 5. Relationship Drift

After each conversation:
```json
{
  "pairwise_drift": [
    { "agent_a": "brain", "agent_b": "twitter-alt", "drift": -0.02, "reason": "disagreed on strategy" },
    { "agent_a": "opus", "agent_b": "brain", "drift": +0.01, "reason": "aligned on priorities" }
  ]
}
```

**Drift rules:**
- Max drift per conversation: ±0.03
- Floor: 0.10 (even at worst, can still talk)
- Ceiling: 0.95 (even at best, maintain distance)
- Last 20 drift records kept for traceability

### 6. RPG Stats (6 Attributes)

```typescript
const VRL = clamp(avgEngagement * 1000, 0, 99) || BASELINE.VRL;
const SPD = clamp(99 - (avgHoursToFirstStep / 24) * 99, 0, 99) || BASELINE.SPD;
const RCH = totalImpressions > 0
  ? clamp((Math.log10(totalImpressions) / 6) * 99, 0, 99)
  : BASELINE.RCH;
const TRU = clamp(missionSuccessRate * avgAffinity * 2 * 99, 0, 99) || BASELINE.TRU;
const WIS = memoryCount > 0
  ? clamp((Math.log10(memoryCount) / Math.log10(500)) * avgConfidence * 99, 0, 99)
  : BASELINE.WIS;
const CRE = draftCount > 0
  ? clamp(Math.min(draftCount / 50, 1) * acceptRate * 99, 0, 99)
  : BASELINE.CRE;
```

**Each agent shows 4 relevant stats** (not all 6):
```typescript
const RELEVANT_STATS = {
  opus:               ['TRU', 'SPD', 'WIS', 'CRE'],  // Chief of Staff
  brain:              ['WIS', 'TRU', 'SPD', 'CRE'],  // Researcher
  growth:             ['SPD', 'RCH', 'VRL', 'WIS'],  // Growth
  creator:            ['CRE', 'WIS', 'VRL', 'TRU'],  // Creative
  'twitter-alt':      ['VRL', 'RCH', 'SPD', 'CRE'],  // Social
  'company-observer': ['WIS', 'TRU', 'SPD', 'RCH'],  // Observer
};
```

### 7. Level Calculation

```typescript
const level = Math.min(15, Math.floor(Math.log2(memoryCount + completedMissions.length * 3 + 1)) + 1);
```

More memories + more completed missions = higher level. log2 makes early levels fast and late levels slow.

### 8. RPG Classes

- Minion → Commander (runs the show)
- Sage → Sage (literally Sage)
- Scout → Ranger (scouts terrain)
- Quill → Artisan (crafts content)
- Xalt → Bard (loudest mouth)
- Observer → Oracle (sees furthest)

### 9. 3D Avatars (Tripo AI)

**Workflow:**
1. Prepare 2D concept art (Midjourney/DALL-E/hand-drawn)
2. Upload to Tripo AI
3. Settings:
   - Make Image Better: ON
   - Mesh Quality: Ultra
   - Texture: ON + 4K
   - PBR: OFF
   - Topology: Triangle
   - Smart Low Poly v2: ON
   - Polycount: Auto
   - AI Model: v3.0 Fast & Balanced
4. Generate (~1-2 minutes, 35 credits per model)
5. Export as GLB

Cost: ~210 credits for 6 characters ($10/month Tripo plan)

### 10. Key Design Principles

**Hard Bans Matter More Than Skills:**
- "You don't need to teach an LLM how to write tweets - Claude, GPT, Gemini are all smart enough. What you need to tell them is what they must never do."
- Every ban exists because it happened before

**Conflict is Written In:**
- Sage's directive: "you often disagree with Xalt's impulsive takes"
- Xalt's directive: "challenge Sage's caution"
- Makes conversations naturally generate tension

**Personalities Evolve:**
- Voice modifiers computed from memory accumulation
- Rules-based (deterministic, $0 cost, debuggable)
- Cached for 6 hours

**Low Affinity Creates Value:**
- brain↔xalt is only 0.2
- "One is 'show me the data or we're done' and the other is 'ship it first, analyze later'"
- "Every conversation between them generates friction, but that friction produces the best insights"

## Implementation Stack

**Backend:**
- VPS (Hetzner 2-core 4GB): $8/month
- Supabase: Free tier
- LLM API: Usage-based, ~$5-15/month

**Frontend:**
- React Three Fiber + @react-three/drei + Framer Motion
- Vercel: Free tier

**3D:**
- Tripo AI: $10/month (cancel after models done)

**Total: ~$8-33/month**
