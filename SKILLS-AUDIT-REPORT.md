# OpenClaw Skills Comprehensive Audit Report

**Generated:** 2026-01-29  
**Total Skills Audited:** 52

---

## Executive Summary

### Status Overview

| Status | Count | Percentage |
|--------|-------|------------|
| ✅ **Working** | 20 | 38.5% |
| ⚠️ **Needs Config** | 6 | 11.5% |
| ❌ **Not Installed** | 16 | 30.8% |
| ℹ️ **No Requirements** | 4 | 7.7% |
| ⚠️ **No Metadata** | 6 | 11.5% |

### Key Findings

- **20 skills (38.5%)** are fully functional and ready to use
- **6 skills (11.5%)** have the CLI installed but need API keys or configuration
- **16 skills (30.8%)** require installation of CLI tools
- **6 skills (11.5%)** have no metadata and need investigation
- **4 skills (7.7%)** are built-in features with no external requirements

---

## ✅ Working Skills (20)

These skills are fully installed, configured, and ready to use:

### Communication & Social
1. **bird** 🐦 (v0.8.0) - X/Twitter CLI
2. **imsg** 📨 (v0.4.0) - iMessage CLI

### Email & Messaging
3. **gog** 🎮 (v0.9.0) - Gmail CLI

### Note-Taking & Organization
4. **apple-notes** 📝 (v0.3.3) - Apple Notes via memo CLI
5. **apple-reminders** ⏰ (v0.1.1) - Apple Reminders via remindctl
6. **obsidian** 💎 (v0.2.2) - Obsidian CLI

### AI & Content
7. **gemini** ♊️ (v0.26.0) - Google Gemini CLI
8. **summarize** 🧾 (v0.10.0) - Summarization tool
9. **nano-pdf** 📄 (v0.2.1) - PDF editing

### Media & Content
10. **blogwatcher** 📰 (dev) - Blog monitoring
11. **camsnap** 📸 (v0.2.0) - Camera snapshot tool
12. **gifgrep** 🧲 (v0.2.1) - GIF search
13. **openai-whisper** 🎙️ - Speech transcription
14. **video-frames** 🎞️ - Video frame extraction (ffmpeg)
15. **peekaboo** 👀 (v3.0.0-beta3) - Screen sharing/monitoring

### Development & Utilities
16. **mcporter** 📦 (v0.7.3) - MCP server manager
17. **session-logs** 📜 - Session log analysis (jq + ripgrep)
18. **weather** 🌤️ - Weather via wttr.in (curl)

### Food & Services
19. **food-order** 🥡 - Food delivery CLI (ordercli)
20. **ordercli** 🛵 - Order management

---

## ⚠️ Needs Configuration (6)

These skills have the necessary tools installed but require API keys or configuration:

### 1. **local-places** 📍
- **Status:** `uv` installed, missing API key
- **Required:** `GOOGLE_PLACES_API_KEY`
- **Action:** Set environment variable in shell config

### 2. **nano-banana-pro** 🍌
- **Status:** `uv` installed, missing API key
- **Required:** `GEMINI_API_KEY`
- **Action:** Set environment variable with Gemini API key

### 3. **openai-image-gen** 🖼️
- **Status:** `python3` installed, missing API key
- **Required:** `OPENAI_API_KEY`
- **Action:** Set environment variable with OpenAI API key

### 4. **openai-whisper-api** ☁️
- **Status:** `curl` installed, missing API key
- **Required:** `OPENAI_API_KEY`
- **Action:** Set environment variable with OpenAI API key

### 5. **trello** 📋
- **Status:** `jq` installed, missing credentials
- **Required:** `TRELLO_API_KEY`, `TRELLO_TOKEN`
- **Action:** Get credentials from Trello developer portal

### 6. **sherpa-onnx-tts** 🗣️
- **Status:** No bins required, missing model paths
- **Required:** `SHERPA_ONNX_RUNTIME_DIR`, `SHERPA_ONNX_MODEL_DIR`
- **Action:** Download ONNX runtime and TTS models, set paths

---

## ❌ Not Installed (16)

These skills require CLI tool installation:

### High Priority (Commonly Useful)
1. **1password** 🔐 - Password management
   - Install: `brew install 1password-cli`
   - Binary: `op`

2. **himalaya** 📧 - Email CLI
   - Install: `brew install himalaya`
   - Binary: `himalaya`

3. **tmux** 🧵 - Terminal multiplexer (IMPORTANT for many skills!)
   - Install: `brew install tmux`
   - Binary: `tmux`
   - **Note:** Required by 1password skill and others for TTY sessions

4. **things-mac** ✅ - Things 3 task manager
   - Install: `go install github.com/nicolai86/things3-cli/cmd/things@latest`
   - Binary: `things`
   - macOS only

5. **openhue** 💡 - Philips Hue control
   - Install: `brew install openhue/cli/openhue-cli`
   - Binary: `openhue`

### Medium Priority (Specialized Use)
6. **bear-notes** 🐻 - Bear notes app
   - Install: `go install github.com/tylerwince/grizzly/cmd/grizzly@latest`
   - Binary: `grizzly`
   - macOS only

7. **blucli** 🫐 - Bluesky CLI
   - Install: `go install github.com/steipete/blucli/cmd/blu@latest`
   - Binary: `blu`

8. **clawdhub** - ClawdHub CLI
   - Install: `npm install -g clawdhub`
   - Binary: `clawdhub`

9. **eightctl** 🎛️ - Eight Sleep control
   - Install: `go install github.com/steipete/eightctl/cmd/eightctl@latest`
   - Binary: `eightctl`

10. **goplaces** 📍 - Google Places search
    - Install: `brew install steipete/tap/goplaces`
    - Binary: `goplaces`
    - Also needs: `GOOGLE_PLACES_API_KEY`

11. **model-usage** 📊 - Model usage tracking
    - Install: `brew install --cask steipete/tap/codexbar`
    - Binary: `codexbar`
    - macOS only

12. **oracle** 🧿 - AI CLI
    - Install: `npm install -g @steipete/oracle`
    - Binary: `oracle`

13. **sag** 🗣️ - ElevenLabs TTS
    - Install: `brew install steipete/tap/sag`
    - Binary: `sag`
    - Also needs: `ELEVENLABS_API_KEY`

14. **songsee** 🌊 - Song recognition
    - Install: `brew install steipete/tap/songsee`
    - Binary: `songsee`

15. **sonoscli** 🔊 - Sonos control
    - Install: `go install github.com/[repo]/sonos@latest`
    - Binary: `sonos`
    - **Note:** Need to verify repo path in SKILL.md

16. **wacli** 📱 - WhatsApp CLI
    - Install: `brew install steipete/tap/wacli`
    - Binary: `wacli`

---

## ℹ️ No Requirements (4)

These are built-in features or use existing OpenClaw infrastructure:

1. **coding-agent** 🧩 - Uses anyBins (claude/codex/opencode/pi) - optional
2. **notion** 📝 - API-based, no CLI required
3. **spotify-player** 🎵 - Uses anyBins (spogo/spotify_player) - optional
4. **voice-call** 📞 - Config-based plugin

---

## ⚠️ No Metadata (6)

These skills exist but have malformed or missing metadata:

1. **bluebubbles** - iMessage relay server
2. **canvas** - Canvas integration
3. **discord** - Discord integration
4. **github** - GitHub integration
5. **skill-creator** - Skill creation tool
6. **slack** - Slack integration

**Action Required:** Review these SKILL.md files and add proper metadata sections.

---

## Detailed Recommendations

### Immediate Actions (Stage 0 Blockers)

1. **Install tmux** (CRITICAL)
   ```bash
   brew install tmux
   ```
   Required by 1password and other interactive CLI skills.

2. **Fix No Metadata Skills**
   - Review and add metadata to: bluebubbles, canvas, discord, github, skill-creator, slack
   - These may be functional but can't be properly audited

### High-Value Quick Wins

Install these for immediate productivity gains:

```bash
# Password management
brew install 1password-cli

# Email
brew install himalaya

# Task management (if using Things)
go install github.com/nicolai86/things3-cli/cmd/things@latest

# Smart home (if using Hue)
brew install openhue/cli/openhue-cli
```

### Configure Existing Tools

Set up API keys for already-installed tools:

```bash
# Add to ~/.zshrc or ~/.bashrc
export GOOGLE_PLACES_API_KEY="your-key-here"
export GEMINI_API_KEY="your-key-here"
export OPENAI_API_KEY="your-key-here"
export TRELLO_API_KEY="your-key-here"
export TRELLO_TOKEN="your-token-here"
```

### Low Priority / Consider Removing

These skills may have limited use depending on your workflow:

- **blogwatcher** - If not actively monitoring blogs
- **eightctl** - If not using Eight Sleep
- **sonoscli** - If not using Sonos speakers
- **wacli** - If not using WhatsApp heavily

Consider uninstalling unused tools to reduce maintenance:

```bash
# Example - remove if not used
brew uninstall blogwatcher
```

---

## Installation Priority Matrix

### Must Have (Install Now)
1. ✅ tmux - Required by other skills
2. ✅ 1password-cli - Security & credentials
3. ⚠️ himalaya - Email access (if needed)

### Should Have (Install Soon)
4. things-mac - Task management (if using Things)
5. openhue - Smart home control (if using Hue)
6. bear-notes / obsidian - Note-taking (already have obsidian!)

### Nice to Have (Install as Needed)
7. blucli - Social media
8. sag - Voice/TTS (requires API key)
9. songsee - Music features
10. wacli - Messaging

### Optional (Low Usage)
11. eightctl - Very specific hardware
12. model-usage - Development tracking
13. oracle - Alternative AI interface

---

## Testing Results Summary

### Successful Version Checks
- All 20 working skills responded to version/help commands
- No timeouts or errors detected

### Failed Installations
- 16 skills missing binaries (not installed)
- 0 skills with broken installations

### Configuration Issues
- 6 skills need API keys (but binaries work)
- 2 skills (sherpa-onnx-tts) need model downloads

---

## Next Steps

1. **Immediate** (Today)
   - Install tmux: `brew install tmux`
   - Fix metadata for 6 skills without proper headers
   
2. **Short Term** (This Week)
   - Install high-priority tools (1password, himalaya)
   - Configure API keys for local-places, nano-banana-pro, openai tools
   
3. **Medium Term** (This Month)
   - Audit skills with "no metadata" - verify they work or remove
   - Install specialized tools based on actual usage patterns
   - Document any custom configurations in TOOLS.md
   
4. **Long Term** (Ongoing)
   - Review unused skills quarterly
   - Remove tools that haven't been used in 3+ months
   - Keep dependencies up to date with `brew upgrade`

---

## Appendix: Full Tool Inventory

### Installed Tools by Category

**System Utilities:** curl, ffmpeg, jq, python3, rg (ripgrep), uv

**Communication:** bird, gog, imsg

**Note-Taking:** memo, obsidian-cli, remindctl

**AI/ML:** gemini, nano-pdf, whisper

**Media:** camsnap, gifgrep, peekaboo

**Development:** mcporter, summarize

**Services:** ordercli (2 variants)

### Not Installed but Available

See "Not Installed" section above for complete list with installation commands.

---

**End of Report**

*This audit was performed automatically by analyzing SKILL.md metadata and testing CLI tools. All version numbers and paths are current as of the audit date.*
