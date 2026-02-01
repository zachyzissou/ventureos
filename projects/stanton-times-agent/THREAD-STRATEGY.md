# StantonTimes Thread Strategy

**Strategy:** Bot uses intelligent judgment - threads are optional, not automatic.

---

## Default: Single Tweet

**Most news should be a single tweet.** The bot should:
- Condense content to fit 280 characters when reasonable
- Keep the core message intact
- Add link for "more details" if needed

**Examples:**
- Ship reveals → Single tweet
- Patch notes → Single tweet with highlights
- Event announcements → Single tweet
- Quick updates → Single tweet

---

## When to Use Threads

Threads should ONLY be used when:

### 1. Multi-Part News (Sequential Information)
**Example:** Patch notes with multiple distinct systems
```
[1/3] 📰 Star Citizen 3.25 PTU Live

Performance: 20-30 FPS gains across all landing zones

[2/3] New Features:
- Salvage rework complete
- Levski mission chains
- Reclaimer bug fixes

[3/3] Known Issues:
- Server crashes under investigation
- Some missions not spawning (workaround available)
```

### 2. Complex Analysis (Multiple Perspectives)
**Example:** Ship size creep analysis
```
[1/4] 📊 Analysis: Hermes Size Creep

@SpaceTomatoGG breaks down how the Hermes doubled in size from concept

[2/4] Original Concept:
- 12m length
- 2-person crew
- Compact stealth design

[3/4] Current Stats:
- 24m length (+100%)
- 4-person recommended
- Larger profile = reduced stealth

[4/4] Community Impact:
Players questioning "concept creep" across multiple ships. Is this a pattern?
```

### 3. Event Coverage (Live Updates)
**Example:** CitizenCon reveals
```
[1/5] 🎮 CitizenCon 2026 Day 1 Recap

Major announcements from today's keynote...

[continues with distinct announcements]
```

### 4. Tutorial/Educational (Step-by-Step)
**Example:** Game mechanic explanation
```
[1/3] 🎓 How the New Salvage System Works

Step-by-step guide for new players...
```

---

## When NOT to Use Threads

❌ **Simple announcements**
- "New ship available" → Just say it in one tweet

❌ **Short updates**
- "Servers back online" → Single tweet

❌ **Already condensed content**
- If it CAN fit in 280 chars with minor edits → Keep it single

❌ **Forcing threads for length**
- If bot has to split a 300-char message into 2 tweets just because it's slightly long → Condense to single tweet instead

---

## Bot Decision Logic

```javascript
function shouldUseThread(content, context) {
  // 1. Check if content fits in single tweet
  if (content.length <= 280) return false;
  
  // 2. Try to condense first
  const condensed = condenseContent(content);
  if (condensed.length <= 280 && !lossOfMeaning(condensed, content)) {
    return false; // Use condensed single tweet
  }
  
  // 3. Check content type
  if (context.type === 'simple_announcement') return false;
  if (context.type === 'quick_update') return false;
  
  // 4. Check if multi-part structure exists
  if (hasMultipleDistinctPoints(content)) return true;
  if (hasSequentialSteps(content)) return true;
  
  // 5. Check if analysis/commentary
  if (context.isAnalysis && content.length > 400) return true;
  
  // Default: Try to condense to single tweet
  return false;
}
```

---

## Condensing Guidelines

**Good condensing:**
```
Before (350 chars):
"The Aegis Vanguard Sentinel has been revealed at CitizenCon 2026. 
The ship features advanced electronic warfare capabilities including 
enhanced radar systems and signal jamming technology. Pricing is set 
at $275 for standalone purchase, available now in the pledge store."

After (279 chars):
"📰 Aegis Vanguard Sentinel revealed at CitizenCon

✨ Advanced EW capabilities
📡 Enhanced radar & jamming
💰 $275 standalone, available now

Full specs: [link]"
```

**Bad condensing (loses meaning):**
```
Before: "Major community concerns about ship size creep..."
After: "Ship bigger now"
```

---

## Approval Message Format

### Single Tweet
```
📰 New Story: Vanguard Reveal

"📰 Aegis Vanguard Sentinel revealed at CitizenCon

✨ Advanced EW capabilities
📡 Enhanced radar & jamming
💰 $275 standalone"

Source: @RobertsSpaceInd
```

### Thread
```
📰 New Story: Hermes Analysis

🧵 Thread (4 tweets)

[1/4] 📊 Analysis: Hermes Size Creep...

[2/4] Original Concept: 12m length...

[3/4] Current Stats: 24m length...

[4/4] Community Impact: Players questioning...

Source: @SpaceTomatoGG
```

---

## Examples in Practice

### ✅ Single Tweet Examples

**Ship announcement:**
```
📰 Aegis Redeemer now available in game

Purchase at major spaceports for 3.2M aUEC
Stats: [link]
```

**Patch notes:**
```
🔧 Star Citizen Alpha 3.25 PTU Live

✨ Performance gains (20-30 FPS)
🛠️ Salvage rework
🐛 Critical Reclaimer fixes

Full notes: [link]
```

**Event announcement:**
```
🎉 Coramor Festival Returns Feb 14-21

💕 Special missions
🆓 Free Fly weekend
🎁 Limited rewards

Details: [link]
```

### ✅ Thread Examples

**Multi-system patch:**
```
[1/3] 🔧 Star Citizen 3.25 PTU - Major Systems Update

Performance: 20-30 FPS gains across all landing zones + server optimizations

[2/3] Salvage Rework:
- Complete overhaul of scrapping mechanics
- New REC salvage missions
- Reclaimer functionality restored

[3/3] Known Issues:
- Server crashes under investigation (estimated fix: 48h)
- Some Levski missions not spawning (workaround: restart client)
```

**Community analysis:**
```
[1/3] 📊 Creator Perspective: @Morphologis on Clearing The Air Event

"Fundamentally broken design" - major creator calls out event issues

[2/3] Key Criticisms:
- Cargo requirements too high for solo players
- Mission payouts don't match time investment
- Server instability makes completion nearly impossible

[3/3] CIG Response Pending:
Community managers haven't addressed concerns yet. Event ends in 3 days.
```

---

## Summary

- **Default:** Single tweet (condense when reasonable)
- **Threads:** Only for genuinely multi-part or complex content
- **Philosophy:** Respect reader time - threads should add value, not just exceed character limits
- **Quality over length:** One great tweet > three mediocre ones

---

**When in doubt:** Draft both versions and pick the single tweet unless threads clearly add value.
