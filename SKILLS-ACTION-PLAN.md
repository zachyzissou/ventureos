# Skills Audit - Action Plan

Quick reference for fixing the Stage 0 blocker and other critical issues.

---

## 🚨 CRITICAL - Stage 0 Blocker

### tmux Not Installed
**Impact:** Blocks 1password skill and any other interactive CLI workflows

**Fix:**
```bash
brew install tmux
```

**Verification:**
```bash
tmux -V
# Should output: tmux 3.x
```

**Why Critical:** The 1password skill REQUIRES tmux for authentication flows. Without it, password management is completely broken.

---

## ⚠️ High Priority Fixes

### 1. Install 1Password CLI
Once tmux is installed:
```bash
brew install 1password-cli
```

Then configure 1Password desktop app integration:
1. Open 1Password app
2. Settings → Developer
3. Enable "Connect with 1Password CLI"

### 2. Set API Keys for Already-Installed Tools

Add to `~/.zshrc` (or `~/.bashrc`):
```bash
# Google Places (for local-places skill)
export GOOGLE_PLACES_API_KEY="your-google-api-key"

# Gemini (for nano-banana-pro skill)
export GEMINI_API_KEY="your-gemini-api-key"

# OpenAI (for image-gen and whisper-api skills)
export OPENAI_API_KEY="sk-your-openai-api-key"

# Trello (for trello skill)
export TRELLO_API_KEY="your-trello-api-key"
export TRELLO_TOKEN="your-trello-token"

# ElevenLabs (if installing sag for TTS)
export ELEVENLABS_API_KEY="your-elevenlabs-key"
```

Then reload:
```bash
source ~/.zshrc
```

### 3. Fix Skills with Missing Metadata

These 6 skills need metadata sections added to their SKILL.md:

1. **bluebubbles** - iMessage relay
2. **canvas** - Canvas LMS
3. **discord** - Discord bot
4. **github** - GitHub integration
5. **skill-creator** - Skill creation tool
6. **slack** - Slack integration

**Action:** Check each SKILL.md and add proper metadata in YAML frontmatter format.

---

## 📦 Optional Installs (Based on Usage)

### Essential Utilities
```bash
# Email access
brew install himalaya

# Task management (if using Things app)
go install github.com/nicolai86/things3-cli/cmd/things@latest
```

### Social Media
```bash
# Bluesky
go install github.com/steipete/blucli/cmd/blu@latest

# WhatsApp
brew install steipete/tap/wacli
```

### Note-Taking
```bash
# Bear notes (requires Bear app)
go install github.com/tylerwince/grizzly/cmd/grizzly@latest
```

### Smart Home
```bash
# Philips Hue lights
brew install openhue/cli/openhue-cli

# Sonos speakers (verify repo first)
# go install github.com/[repo]/sonos@latest
```

### AI/TTS
```bash
# ElevenLabs TTS (requires API key)
brew install steipete/tap/sag

# AI CLI
npm install -g @steipete/oracle
```

### Development
```bash
# Model usage tracking (macOS only)
brew install --cask steipete/tap/codexbar

# ClawdHub integration
npm install -g clawdhub
```

### Specialized
```bash
# Eight Sleep mattress control
go install github.com/steipete/eightctl/cmd/eightctl@latest

# Song recognition
brew install steipete/tap/songsee

# Google Places search
brew install steipete/tap/goplaces
```

---

## 🧹 Cleanup Candidates

Consider removing if not actively used:

```bash
# Check last use
ls -ltu /opt/homebrew/bin/blogwatcher
ls -ltu /opt/homebrew/bin/ordercli

# Remove if unused
brew uninstall blogwatcher
brew uninstall ordercli  # Note: both food-order and ordercli use this
```

**Duplicate Alert:** `food-order` and `ordercli` skills both use the same `ordercli` binary. Consider merging or removing one skill.

---

## 🔍 Verification Commands

After installing/configuring, verify each skill:

### Test tmux
```bash
tmux new -d -s test
tmux ls
tmux kill-session -t test
```

### Test 1password
```bash
# Should prompt for desktop app authorization
op whoami
```

### Test API keys
```bash
# Check if set
env | grep -E "GOOGLE_PLACES_API_KEY|GEMINI_API_KEY|OPENAI_API_KEY|TRELLO_|ELEVENLABS_API_KEY"

# Test Google Places
goplaces search "coffee shop near me" --limit 1  # After installing goplaces
```

### Test installed CLIs
```bash
# Quick version checks
bird --version
memo --version
remindctl --version
imsg --version
gemini --version
summarize --version
```

---

## 📊 Expected Results After Fixes

### Before
- ✅ Working: 20
- ⚠️ Needs Config: 6
- ❌ Not Installed: 16
- ℹ️ No Requirements: 4
- ⚠️ No Metadata: 6

### After Critical Fixes (tmux + API keys)
- ✅ Working: 27 (+7)
- ⚠️ Needs Config: 0 (-6)
- ❌ Not Installed: 15 (-1)
- ℹ️ No Requirements: 4
- ⚠️ No Metadata: 6

### After All High-Priority Installs (+ 1password, himalaya, things)
- ✅ Working: 30 (+3)
- ❌ Not Installed: 12 (-3)

---

## 🎯 Recommended Installation Order

1. **Now** (Critical)
   - tmux
   - Set API keys in environment

2. **Today** (High Value)
   - 1password-cli
   - himalaya (if using email)

3. **This Week** (As Needed)
   - things-mac (if using Things)
   - openhue (if using Hue)
   - bear-notes/grizzly (if using Bear)

4. **This Month** (Optional)
   - Social media tools (blucli, wacli)
   - AI tools (sag, oracle)
   - Smart home (sonoscli)

5. **Never** (Unless Specific Need)
   - eightctl (unless you own Eight Sleep)
   - model-usage (development only)

---

## 📝 Documentation Updates Needed

After fixes, update these files:

1. **TOOLS.md** - Add local configuration notes:
   - 1Password account/vault names
   - Hue bridge IP (if installed)
   - Sonos speaker names (if installed)
   - Things database path (if installed)

2. **MEMORY.md** - Note what you installed and why

3. **Skills README** - Document which skills are actively used

---

## 🔄 Maintenance Schedule

### Daily
- None needed (skills are stable)

### Weekly
- Check for Homebrew updates: `brew upgrade`
- Review new skill usage in session logs

### Monthly
- Review installed but unused skills
- Clean up old API keys
- Update Go tools: `go install -u github.com/...`

### Quarterly
- Full skill audit (re-run this audit process)
- Remove unused skills
- Check for breaking changes in CLIs

---

**End of Action Plan**

*Start with the Critical section, then work through High Priority as needed.*
