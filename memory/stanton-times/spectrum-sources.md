# Spectrum Monitoring Sources

**RSI Spectrum:** https://robertsspaceindustries.com/spectrum/community/SC

---

## Priority Channels

### P0 - Official (Check Every 30 min)

| Channel | URL | What to Watch |
|---------|-----|---------------|
| **Announcements** | `/spectrum/community/SC/forum/1` | Official CIG posts, patch announcements |
| **Dev Tracker** | `/spectrum/community/SC/tracker` | All developer responses across forums |
| **Patch Notes** | `/spectrum/community/SC/forum/190048` | PTU and LIVE patch documentation |

### P1 - High Priority (Check Every 2 hours)

| Channel | URL | What to Watch |
|---------|-----|---------------|
| **General Chat** | `/spectrum/community/SC/lobby/1` | Community pulse, breaking discussions |
| **PTU Feedback** | `/spectrum/community/SC/forum/4` | Bug reports, first impressions of new patches |
| **Roadmap Discussion** | `/spectrum/community/SC/forum/3` | Feature status, delays, community concerns |

### P2 - Medium Priority (Check 2x daily)

| Channel | URL | What to Watch |
|---------|-----|---------------|
| **Ship Discussion** | `/spectrum/community/SC/forum/65292` | Balance debates, new ship reactions |
| **Lore** | `/spectrum/community/SC/forum/50264` | Story developments, Jump Point summaries |
| **Organizations** | `/spectrum/community/SC/forum/50176` | Major org news, events |

---

## Dev Tracker - Key Developers

Monitor posts from these CIG staff (via Dev Tracker):

| Name | Role | Why Watch |
|------|------|-----------|
| **Zyloh-CIG** | Community Manager | Official clarifications |
| **Disco Lando** | Community Director | Event info, Q&A answers |
| **Jared Huckaby** | Various | Show announcements |
| **YogiKlatt-CIG** | Network Engineer | Server meshing updates |
| **CIG-Wakapedia** | Wiki Lead | Lore confirmations |

---

## Monitoring Approach

### Browser Relay Method (Preferred)

Since Spectrum requires authentication and has no public API:

1. **Attach browser relay** to a Chrome tab logged into Spectrum
2. **Snapshot** the Dev Tracker page
3. **Parse** for new posts since last check
4. **Compare** against `state.json` seen IDs

```javascript
// Example flow
browser.navigate("https://robertsspaceindustries.com/spectrum/community/SC/tracker")
await browser.snapshot()
// Parse developer posts, extract:
// - Author
// - Forum/channel
// - Post content
// - Timestamp
// - Thread title
```

### Fallback: RSS/API Discovery

Check periodically if CIG adds:
- RSS feeds for Spectrum channels
- Public API endpoints
- Webhook integrations

**Current status:** None available (as of 2026-01)

---

## Content Types to Flag

### Immediate Alert (Draft Tweet)
- [ ] New patch announced (PTU or LIVE)
- [ ] Server status updates
- [ ] Event date confirmations
- [ ] Major bug acknowledgment
- [ ] Feature delay/removal

### Same-Day Coverage
- [ ] Dev clarification on mechanics
- [ ] Roadmap card movement
- [ ] Ship balance announcements
- [ ] Lore drops
- [ ] Community event promotions

### Weekly Roundup Material
- [ ] Dev Q&A summaries
- [ ] Recurring community concerns
- [ ] Trending discussion topics
- [ ] Feature request momentum

---

## Spectrum vs Twitter Sources

| Source | Strength | Weakness |
|--------|----------|----------|
| **Spectrum** | Detailed dev responses, official info first | Requires auth, no API |
| **Twitter** | Easy monitoring, quick alerts | Often openclawes Spectrum |
| **Reddit** | Community analysis, memes | Speculation mixed with news |

**Strategy:** Spectrum for verification and detail, Twitter for speed alerts.

---

## Implementation Notes

### State Tracking

Add to `state.json`:
```json
{
  "spectrum": {
    "last_check": "2026-01-28T12:00:00Z",
    "last_dev_tracker_check": "2026-01-28T12:00:00Z",
    "seen_spectrum_ids": [],
    "flagged_threads": []
  }
}
```

### Cron Integration

| Job | Schedule | Target |
|-----|----------|--------|
| Spectrum P0 | Every 30 min | Dev Tracker, Announcements |
| Spectrum P1 | Every 2 hours | PTU Feedback, General |
| Spectrum Digest | Daily 9 AM | Compile noteworthy threads |

### Authentication

Spectrum monitoring requires a logged-in session. Options:
1. **Browser relay** with persistent Chrome profile
2. **Session cookie** extraction (refresh periodically)
3. **Headless browser** with saved auth state

**Security note:** Store credentials in `.env`, never in config files.

---

## Sample Dev Tracker Parse

When checking Dev Tracker, extract:

```json
{
  "post_id": "spectrum-12345",
  "author": "YogiKlatt-CIG",
  "role": "Network Engineer",
  "forum": "PTU Feedback",
  "thread_title": "Server Meshing Performance Issues",
  "content_preview": "We're aware of the desync issues and are deploying a hotfix...",
  "timestamp": "2026-01-28T10:30:00Z",
  "thread_url": "https://robertsspaceindustries.com/spectrum/community/SC/forum/4/thread/..."
}
```

### News Criteria

Flag for draft if:
- Contains version numbers (Alpha X.X)
- Mentions "fix", "patch", "hotfix", "update"
- Confirms or denies rumors
- Announces dates/times
- Uses words like "confirmed", "planned", "targeting"
