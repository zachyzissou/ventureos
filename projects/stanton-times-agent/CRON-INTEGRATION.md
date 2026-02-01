# StantonTimes Cron Integration with Thread Support

## Updated Workflow for Cron Jobs

When a cron job finds newsworthy content, it should:

1. **Draft the story** using `draft-story.mjs`
2. **Add to state.json** with correct format (thread or single tweet)
3. **Send to Discord** for approval using `send-embed.mjs`

---

## Step-by-Step Example

### Step 1: Draft the Story

```javascript
// In cron job: Determine if content should be a thread

const { draftStory } = await import('./lib/draft-story.mjs');

const rawContent = `📰 Star Citizen Alpha 3.25 PTU Live

Performance improvements across the board:
- 20-30 FPS gains in all major landing zones
- Server optimizations reduce desync
- Memory leak fixes

New features:
- Complete salvage rework
- Levski mission chains expanded
- Reclaimer bug fixes

Known issues:
- Server crashes under investigation
- Some missions not spawning (restart client to fix)`;

const metadata = {
  type: 'patch_notes',  // or 'analysis', 'announcement', etc.
  isAnalysis: false,
  hasMultipleParts: true,  // Multiple systems updated
  isBreaking: false
};

const draft = draftStory(rawContent, metadata);

// draft = {
//   type: 'thread',  // or 'single'
//   thread: [...],   // if thread
//   tweet: "...",    // if single
//   tweetCount: 3    // if thread
// }
```

### Step 2: Add to state.json

```javascript
import { readFileSync, writeFileSync } from 'fs';

const state = JSON.parse(readFileSync('./config/state.json', 'utf8'));

const approval = {
  id: `approval_${Date.now()}`,
  topic: "Alpha 3.25 PTU Release",
  source: "@RobertsSpaceInd",
  tweet_id: sourceTweetId,
  submitted_at: new Date().toISOString(),
  ...draft  // Spreads 'type', 'thread'/'tweet', 'tweetCount'
};

state.pendingApprovals.push(approval);
writeFileSync('./config/state.json', JSON.stringify(state, null, 2));
```

### Step 3: Send to Discord

```javascript
import { execSync } from 'child_process';

if (draft.type === 'thread') {
  // Send thread to Discord
  execSync(`node config/send-embed.mjs \\
    --title "📰 New Story: Alpha 3.25 PTU" \\
    --thread '${JSON.stringify(draft.thread)}' \\
    --footer "Source: @RobertsSpaceInd"`);
} else {
  // Send single tweet to Discord
  execSync(`node config/send-embed.mjs \\
    --title "📰 New Story: Alpha 3.25 PTU" \\
    --description "${draft.tweet}" \\
    --footer "Source: @RobertsSpaceInd"`);
}
```

---

## state.json Format

### Thread Format
```json
{
  "id": "approval_1738366800001",
  "topic": "Alpha 3.25 PTU Release",
  "source": "@RobertsSpaceInd",
  "tweet_id": "123456789",
  "submitted_at": "2026-01-31T19:00:00.000Z",
  "type": "thread",
  "thread": [
    "📰 Star Citizen Alpha 3.25 PTU Live\n\nPerformance: 20-30 FPS gains across all landing zones",
    "New Features:\n- Complete salvage rework\n- Levski missions expanded\n- Reclaimer fixes",
    "Known Issues:\n- Server crashes being investigated\n- Mission spawn fix: restart client"
  ],
  "tweetCount": 3,
  "status": "pending"
}
```

### Single Tweet Format
```json
{
  "id": "approval_1738366800002",
  "topic": "Quick Update",
  "source": "@discolando",
  "submitted_at": "2026-01-31T19:00:00.000Z",
  "type": "single",
  "tweet": "📰 Servers back online. Happy flying! ✨",
  "status": "pending"
}
```

---

## Approval Processing

When user reacts with ✅ in Discord:

```javascript
import { execSync } from 'child_process';

// Get approval ID from Discord message
const approvalId = "approval_1738366800001";

// Process approval
execSync(`node lib/process-approval.mjs ${approvalId} approve`);

// This will:
// 1. Read state.json
// 2. Find the approval
// 3. If thread: call post-thread.mjs
// 4. If single: call post-tweet.mjs
// 5. Add to posted_stories
// 6. Remove from pendingApprovals
```

---

## Metadata Guidelines

Use these metadata hints to guide thread decisions:

### `type` field:
- `"announcement"` - Simple news (single tweet preferred)
- `"quick_update"` - Status update (single tweet)
- `"simple_news"` - Basic news (single tweet)
- `"patch_notes"` - Patch/update (thread if multi-system)
- `"analysis"` - Commentary/analysis (thread if >600 chars)
- `"event"` - Event coverage (thread if multi-part)
- `"tutorial"` - How-to content (thread if step-by-step)

### `isAnalysis` field:
- `true` - Content is analytical/commentary
- `false` - Content is factual news

### `hasMultipleParts` field:
- `true` - Content has distinct sections/topics
- `false` - Content is single-topic

### `isBreaking` field:
- `true` - Time-sensitive, condense to single tweet
- `false` - Can use thread if appropriate

---

## Examples by Content Type

### Example 1: Simple Announcement → Single Tweet

```javascript
const content = "The Aegis Vanguard Sentinel is now available in the pledge store for $275.";

const metadata = {
  type: 'announcement',
  isBreaking: false
};

const draft = draftStory(content, metadata);
// Result: { type: 'single', tweet: "The Aegis Vanguard..." }
```

### Example 2: Complex Analysis → Thread

```javascript
const content = `RSI Hermes has doubled in size from its original concept.

Original concept specs:
- 12m length
- 2-person crew
- Compact stealth design

Current implementation:
- 24m length (+100%)
- 4-person recommended crew
- Larger profile reduces stealth effectiveness

This continues a pattern of ship size creep that's affected multiple concept ships. Community members are raising concerns about long-term balance implications.`;

const metadata = {
  type: 'analysis',
  isAnalysis: true,
  hasMultipleParts: true
};

const draft = draftStory(content, metadata);
// Result: { type: 'thread', thread: [...4 tweets...], tweetCount: 4 }
```

### Example 3: Multi-System Patch → Thread

```javascript
const content = `Star Citizen Alpha 3.25 PTU now live with major updates across multiple systems.

Performance improvements:
- 20-30 FPS gains in all landing zones
- Server desync reduced

Salvage rework complete:
- New scrapping mechanics
- REC missions added
- Reclaimer fully functional

Known issues:
- Server crashes under investigation
- Mission spawns: restart client if issues`;

const metadata = {
  type: 'patch_notes',
  hasMultipleParts: true,
  isBreaking: false
};

const draft = draftStory(content, metadata);
// Result: { type: 'thread', thread: [...3 tweets...], tweetCount: 3 }
```

---

## Migration Path

Existing pending approvals in state.json that only have `draft` field:

1. Will be treated as single tweets (backward compatible)
2. Can be manually converted to new format
3. Or let them post as-is and new submissions use new format

---

**Ready to use!** Update cron job prompts to use this workflow.
