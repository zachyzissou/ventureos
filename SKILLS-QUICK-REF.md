# Clawdbot Skills - Quick Reference Card

**🚨 CRITICAL:** tmux not installed → `brew install tmux`

---

## ✅ Working Now (20)

| Skill | Binary | Purpose |
|-------|--------|---------|
| apple-notes | memo | Apple Notes CLI |
| apple-reminders | remindctl | Apple Reminders |
| bird | bird | X/Twitter |
| blogwatcher | blogwatcher | Blog monitoring |
| camsnap | camsnap | Camera snapshots |
| food-order | ordercli | Food delivery |
| gemini | gemini | Google Gemini AI |
| gifgrep | gifgrep | GIF search |
| gog | gog | Gmail CLI |
| imsg | imsg | iMessage |
| mcporter | mcporter | MCP servers |
| nano-pdf | nano-pdf | PDF editing |
| obsidian | obsidian-cli | Obsidian notes |
| openai-whisper | whisper | Speech-to-text |
| ordercli | ordercli | Order management |
| peekaboo | peekaboo | Screen sharing |
| session-logs | jq, rg | Log analysis |
| summarize | summarize | Web summarization |
| video-frames | ffmpeg | Video extraction |
| weather | curl | Weather info |

---

## ⚠️ Need API Keys (6)

```bash
# Add to ~/.zshrc
export GOOGLE_PLACES_API_KEY="..."     # → local-places
export GEMINI_API_KEY="..."            # → nano-banana-pro
export OPENAI_API_KEY="sk-..."         # → openai-image-gen, openai-whisper-api
export TRELLO_API_KEY="..."            # → trello
export TRELLO_TOKEN="..."              # → trello
```

---

## ❌ Install Commands (High Priority)

```bash
# CRITICAL - Required by other skills
brew install tmux

# Password management (needs tmux first!)
brew install 1password-cli

# Email
brew install himalaya

# Task management (if using Things)
go install github.com/nicolai86/things3-cli/cmd/things@latest

# Smart home
brew install openhue/cli/openhue-cli

# Social
go install github.com/steipete/blucli/cmd/blu@latest
brew install steipete/tap/wacli

# Notes
go install github.com/tylerwince/grizzly/cmd/grizzly@latest

# Voice (needs ELEVENLABS_API_KEY)
brew install steipete/tap/sag
```

---

## ℹ️ Built-In (4)

- coding-agent (uses optional CLIs)
- notion (API-based)
- spotify-player (uses optional CLIs)
- voice-call (config-based)

---

## ⚠️ Need Metadata Fix (6)

Check SKILL.md:
- bluebubbles
- canvas
- discord
- github
- skill-creator
- slack

---

## 🎯 Install Priority

1. **Now:** tmux
2. **Today:** 1password-cli, API keys
3. **This Week:** himalaya, things-mac (if used)
4. **As Needed:** openhue, blucli, wacli, sag

---

## 📊 Stats

- ✅ Working: 20 (38.5%)
- ⚠️ Config: 6 (11.5%)
- ❌ Missing: 16 (30.8%)
- ℹ️ Built-in: 4 (7.7%)
- ⚠️ Broken: 6 (11.5%)

**After fixes: ~50-60% functional**

---

## 🔗 Full Reports

- SKILLS-AUDIT-SUMMARY.md
- SKILLS-AUDIT-REPORT.md
- SKILLS-DETAILED-BREAKDOWN.md
- SKILLS-ACTION-PLAN.md
