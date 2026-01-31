# Clawdbot Skills - Detailed Breakdown

Complete skill-by-skill analysis with installation paths, versions, and specific notes.

---

## 1password 🔐
- **Status:** ❌ Not Installed
- **Required Binary:** `op`
- **Install:** `brew install 1password-cli`
- **Purpose:** Password/secrets management via 1Password CLI
- **Dependencies:** Requires tmux for interactive sessions
- **Notes:** MUST use tmux for authentication flow. Critical dependency missing: tmux itself is not installed!

---

## apple-notes 📝
- **Status:** ✅ Working
- **Binary:** `memo` → `/opt/homebrew/bin/memo`
- **Version:** 0.3.3
- **Install:** `brew install antoniorodr/memo/memo`
- **Purpose:** Create, view, edit, search Apple Notes
- **OS:** macOS only
- **Notes:** Works perfectly, no issues detected

---

## apple-reminders ⏰
- **Status:** ✅ Working
- **Binary:** `remindctl` → `/opt/homebrew/bin/remindctl`
- **Version:** 0.1.1
- **Install:** `brew install steipete/tap/remindctl`
- **Purpose:** Manage Apple Reminders from CLI
- **OS:** macOS only
- **Notes:** Full CRUD operations on reminders

---

## bear-notes 🐻
- **Status:** ❌ Not Installed
- **Required Binary:** `grizzly`
- **Install:** `go install github.com/tylerwince/grizzly/cmd/grizzly@latest`
- **Purpose:** Manage Bear notes via CLI
- **OS:** macOS only
- **Notes:** Requires Bear app + API token for full functionality

---

## bird 🐦
- **Status:** ✅ Working
- **Binary:** `bird` → `/opt/homebrew/bin/bird`
- **Version:** 0.8.0 (d3dd4a0d)
- **Install:** `brew install steipete/tap/bird` or `npm install -g @steipete/bird`
- **Purpose:** X/Twitter CLI for reading, posting, engagement
- **Notes:** Cookie-based auth, GraphQL API. Posting may trigger rate limits.

---

## blogwatcher 📰
- **Status:** ✅ Working
- **Binary:** `blogwatcher` → `/opt/homebrew/bin/blogwatcher`
- **Version:** dev
- **Install:** `go install github.com/Hyaxia/blogwatcher/cmd/blogwatcher@latest`
- **Purpose:** Monitor blog RSS feeds
- **Notes:** Running dev version, may want stable release

---

## blucli 🫐
- **Status:** ❌ Not Installed
- **Required Binary:** `blu`
- **Install:** `go install github.com/steipete/blucli/cmd/blu@latest`
- **Purpose:** Bluesky social network CLI
- **Notes:** Alternative to X/Twitter

---

## bluebubbles
- **Status:** ⚠️ No Metadata
- **Purpose:** iMessage relay server
- **Notes:** SKILL.md exists but has no metadata section. Needs manual review.

---

## camsnap 📸
- **Status:** ✅ Working
- **Binary:** `camsnap` → `/opt/homebrew/bin/camsnap`
- **Version:** 0.2.0
- **Install:** `brew install steipete/tap/camsnap`
- **Purpose:** Capture photos from Mac camera
- **Notes:** Good for automation/security snapshots

---

## canvas
- **Status:** ⚠️ No Metadata
- **Purpose:** Canvas LMS integration (likely)
- **Notes:** SKILL.md exists but has no metadata section. Needs manual review.

---

## clawdhub
- **Status:** ❌ Not Installed
- **Required Binary:** `clawdhub`
- **Install:** `npm install -g clawdhub`
- **Purpose:** ClawdHub service integration
- **Notes:** May be optional if not using ClawdHub service

---

## coding-agent 🧩
- **Status:** ℹ️ No Requirements
- **Optional Binaries:** claude, codex, opencode, pi (anyBins)
- **Purpose:** AI coding assistance
- **Notes:** Uses built-in capabilities or optional CLIs

---

## discord
- **Status:** ⚠️ No Metadata
- **Purpose:** Discord bot/integration
- **Notes:** SKILL.md exists but has no metadata section. Likely API-based.

---

## eightctl 🎛️
- **Status:** ❌ Not Installed
- **Required Binary:** `eightctl`
- **Install:** `go install github.com/steipete/eightctl/cmd/eightctl@latest`
- **Purpose:** Control Eight Sleep mattress
- **Notes:** Very specialized hardware, low priority unless you own one

---

## food-order 🥡
- **Status:** ✅ Working
- **Binary:** `ordercli` → `/opt/homebrew/bin/ordercli`
- **Version:** (no --version output)
- **Install:** `brew install steipete/tap/ordercli`
- **Purpose:** Food delivery order management
- **Notes:** Identical to ordercli skill - may be duplicate

---

## gemini ♊️
- **Status:** ✅ Working
- **Binary:** `gemini` → `/opt/homebrew/bin/gemini`
- **Version:** 0.26.0
- **Install:** `brew install gemini-cli`
- **Purpose:** Google Gemini AI CLI
- **Notes:** Alternative AI interface to Claude

---

## gifgrep 🧲
- **Status:** ✅ Working
- **Binary:** `gifgrep` → `/opt/homebrew/bin/gifgrep`
- **Version:** 0.2.1
- **Install:** `brew install steipete/tap/gifgrep`
- **Purpose:** Search and manage GIFs
- **Notes:** Good for meme/reaction workflows

---

## github
- **Status:** ⚠️ No Metadata
- **Purpose:** GitHub integration
- **Notes:** SKILL.md exists but has no metadata section. Likely API-based.

---

## gog 🎮
- **Status:** ✅ Working
- **Binary:** `gog` → `/opt/homebrew/bin/gog`
- **Version:** v0.9.0 (99d9575 2026-01-22T04:15:12Z)
- **Install:** `brew install steipete/tap/gogcli`
- **Purpose:** Gmail CLI (clever name: Gmail On the Go)
- **Notes:** Recent build, actively maintained

---

## goplaces 📍
- **Status:** ❌ Not Installed
- **Required Binary:** `goplaces`
- **Required Env:** `GOOGLE_PLACES_API_KEY`
- **Install:** `brew install steipete/tap/goplaces`
- **Purpose:** Google Places API search
- **Notes:** Two-step setup: install + API key

---

## himalaya 📧
- **Status:** ❌ Not Installed
- **Required Binary:** `himalaya`
- **Install:** `brew install himalaya`
- **Purpose:** Universal email CLI (IMAP/SMTP)
- **Notes:** Good alternative to gog for non-Gmail accounts

---

## imsg 📨
- **Status:** ✅ Working
- **Binary:** `imsg` → `/opt/homebrew/bin/imsg`
- **Version:** 0.4.0
- **Install:** `brew install steipete/tap/imsg`
- **Purpose:** Send iMessages from CLI
- **OS:** macOS only
- **Notes:** Works with phone numbers and email addresses

---

## local-places 📍
- **Status:** ⚠️ Needs Config
- **Binary:** `uv` → `/opt/homebrew/bin/uv` ✅ Installed
- **Version:** 0.9.28
- **Required Env:** `GOOGLE_PLACES_API_KEY` ❌ Not Set
- **Purpose:** Local Google Places search with Python
- **Notes:** Tool installed, just needs API key in environment

---

## mcporter 📦
- **Status:** ✅ Working
- **Binary:** `mcporter` → `/Users/zachgonser/.local/bin/mcporter`
- **Version:** 0.7.3
- **Install:** `npm install -g mcporter`
- **Purpose:** MCP (Model Context Protocol) server manager
- **Notes:** Important for AI tool integration

---

## model-usage 📊
- **Status:** ❌ Not Installed
- **Required Binary:** `codexbar`
- **Install:** `brew install --cask steipete/tap/codexbar`
- **Purpose:** Track AI model usage statistics
- **OS:** macOS only (menu bar app)
- **Notes:** Development/monitoring tool, not critical

---

## nano-banana-pro 🍌
- **Status:** ⚠️ Needs Config
- **Binary:** `uv` → `/opt/homebrew/bin/uv` ✅ Installed
- **Version:** 0.9.28
- **Required Env:** `GEMINI_API_KEY` ❌ Not Set
- **Purpose:** Gemini-powered nano text editor
- **Notes:** Tool installed, just needs Gemini API key

---

## nano-pdf 📄
- **Status:** ✅ Working
- **Binary:** `nano-pdf` → `/Users/zachgonser/.local/bin/nano-pdf`
- **Version:** 0.2.1
- **Install:** `uv tool install nano-pdf`
- **Purpose:** Edit PDFs with AI assistance
- **Notes:** Installed via uv, works great

---

## notion 📝
- **Status:** ℹ️ No Requirements
- **Purpose:** Notion workspace integration
- **Notes:** API-based integration, no CLI needed

---

## obsidian 💎
- **Status:** ✅ Working
- **Binary:** `obsidian-cli` → `/opt/homebrew/bin/obsidian-cli`
- **Version:** v0.2.2
- **Install:** `brew install yakitrak/yakitrak/obsidian-cli`
- **Purpose:** Manage Obsidian vaults and notes
- **Notes:** Works with local Obsidian vaults

---

## openai-image-gen 🖼️
- **Status:** ⚠️ Needs Config
- **Binary:** `python3` → `/opt/homebrew/bin/python3` ✅ Installed
- **Version:** 3.14.2
- **Required Env:** `OPENAI_API_KEY` ❌ Not Set
- **Purpose:** Generate images with DALL-E
- **Notes:** Python available, needs OpenAI API key

---

## openai-whisper 🎙️
- **Status:** ✅ Working
- **Binary:** `whisper` → `/opt/homebrew/bin/whisper`
- **Version:** (no --version output, but binary works)
- **Install:** `brew install openai-whisper`
- **Purpose:** Speech-to-text transcription (local)
- **Notes:** Local processing, no API key needed

---

## openai-whisper-api ☁️
- **Status:** ⚠️ Needs Config
- **Binary:** `curl` → `/usr/bin/curl` ✅ Installed
- **Version:** 8.7.1
- **Required Env:** `OPENAI_API_KEY` ❌ Not Set
- **Purpose:** Speech-to-text via OpenAI API (cloud)
- **Notes:** Alternative to local whisper, faster but uses credits

---

## openhue 💡
- **Status:** ❌ Not Installed
- **Required Binary:** `openhue`
- **Install:** `brew install openhue/cli/openhue-cli`
- **Purpose:** Control Philips Hue lights
- **Notes:** Useful if you have Hue bridge + bulbs

---

## oracle 🧿
- **Status:** ❌ Not Installed
- **Required Binary:** `oracle`
- **Install:** `npm install -g @steipete/oracle`
- **Purpose:** AI CLI with multiple model support
- **Notes:** Alternative AI interface

---

## ordercli 🛵
- **Status:** ✅ Working
- **Binary:** `ordercli` → `/opt/homebrew/bin/ordercli`
- **Version:** (no --version output)
- **Install:** `brew install steipete/tap/ordercli`
- **Purpose:** Food delivery order management
- **Notes:** Identical to food-order skill

---

## peekaboo 👀
- **Status:** ✅ Working
- **Binary:** `peekaboo` → `/opt/homebrew/bin/peekaboo`
- **Version:** 3.0.0-beta3 (main/69376fa4-dirty)
- **Install:** `brew install steipete/tap/peekaboo`
- **Purpose:** Screen sharing/camera monitoring
- **OS:** macOS only
- **Notes:** Beta version, actively developed (dirty build = local mods)

---

## sag 🗣️
- **Status:** ❌ Not Installed
- **Required Binary:** `sag`
- **Required Env:** `ELEVENLABS_API_KEY`
- **Install:** `brew install steipete/tap/sag`
- **Purpose:** ElevenLabs text-to-speech
- **Notes:** High-quality TTS, requires paid API access

---

## session-logs 📜
- **Status:** ✅ Working
- **Binaries:** `jq` → `/usr/bin/jq`, `rg` → `/opt/homebrew/bin/rg`
- **Versions:** jq-1.7.1-apple, ripgrep 15.1.0
- **Purpose:** Parse and search Clawdbot session logs
- **Notes:** Both tools system-installed, works perfectly

---

## sherpa-onnx-tts 🗣️
- **Status:** ⚠️ Needs Config
- **Required Env:** `SHERPA_ONNX_RUNTIME_DIR`, `SHERPA_ONNX_MODEL_DIR` ❌ Not Set
- **Purpose:** Local TTS with ONNX models
- **OS:** macOS, Linux, Windows
- **Notes:** Free alternative to ElevenLabs, but requires model download

---

## skill-creator
- **Status:** ⚠️ No Metadata
- **Purpose:** Create new Clawdbot skills
- **Notes:** SKILL.md exists but has no metadata section. Developer tool.

---

## slack
- **Status:** ⚠️ No Metadata
- **Purpose:** Slack integration
- **Notes:** SKILL.md exists but has no metadata section. Likely API-based.

---

## songsee 🌊
- **Status:** ❌ Not Installed
- **Required Binary:** `songsee`
- **Install:** `brew install steipete/tap/songsee`
- **Purpose:** Song recognition (like Shazam)
- **Notes:** Music identification tool

---

## sonoscli 🔊
- **Status:** ❌ Not Installed
- **Required Binary:** `sonos`
- **Install:** `go install github.com/[repo]/sonos@latest` (need to verify repo)
- **Purpose:** Control Sonos speakers
- **Notes:** Repository path needs verification in SKILL.md

---

## spotify-player 🎵
- **Status:** ℹ️ No Requirements
- **Optional Binaries:** spogo, spotify_player (anyBins)
- **Purpose:** Spotify playback control
- **Notes:** Uses optional CLIs if installed, otherwise API-based

---

## summarize 🧾
- **Status:** ✅ Working
- **Binary:** `summarize` → `/opt/homebrew/bin/summarize`
- **Version:** 0.10.0
- **Install:** `brew install steipete/tap/summarize`
- **Purpose:** Summarize web pages, articles, documents
- **Notes:** Works great for content digestion

---

## things-mac ✅
- **Status:** ❌ Not Installed
- **Required Binary:** `things`
- **Install:** `go install github.com/nicolai86/things3-cli/cmd/things@latest`
- **Purpose:** Things 3 task manager CLI
- **OS:** macOS only
- **Notes:** Requires Things 3 app installed

---

## tmux 🧵
- **Status:** ❌ Not Installed (CRITICAL!)
- **Required Binary:** `tmux`
- **Install:** `brew install tmux`
- **Purpose:** Terminal multiplexer for interactive CLI sessions
- **OS:** macOS, Linux
- **Notes:** **REQUIRED by 1password and other interactive skills!** High priority install.

---

## trello 📋
- **Status:** ⚠️ Needs Config
- **Binary:** `jq` → `/usr/bin/jq` ✅ Installed
- **Version:** jq-1.7.1-apple
- **Required Env:** `TRELLO_API_KEY`, `TRELLO_TOKEN` ❌ Not Set
- **Purpose:** Trello board/card management
- **Notes:** jq installed, needs Trello developer credentials

---

## video-frames 🎞️
- **Status:** ✅ Working
- **Binary:** `ffmpeg` → `/opt/homebrew/bin/ffmpeg`
- **Version:** (no --version, but binary works)
- **Install:** `brew install ffmpeg`
- **Purpose:** Extract frames from video files
- **Notes:** ffmpeg is powerful, handles all video formats

---

## voice-call 📞
- **Status:** ℹ️ No Requirements
- **Purpose:** Voice calling integration
- **Notes:** Config-based plugin in Clawdbot settings

---

## wacli 📱
- **Status:** ❌ Not Installed
- **Required Binary:** `wacli`
- **Install:** `brew install steipete/tap/wacli`
- **Purpose:** WhatsApp CLI
- **Notes:** Useful for WhatsApp automation

---

## weather 🌤️
- **Status:** ✅ Working
- **Binary:** `curl` → `/usr/bin/curl` ✅ Installed
- **Version:** 8.7.1
- **Purpose:** Weather information via wttr.in
- **Notes:** Uses curl to query wttr.in API, no config needed

---

**End of Detailed Breakdown**

*Total: 52 skills analyzed*
