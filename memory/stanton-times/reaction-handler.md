# Stanton Times Channel Guide

**ALL messages in this channel must be sent as webhook embeds.**
Never send plain text — always use the embed scripts.

## Scripts Available

### 1. General Messages: `send-embed.mjs`
```powershell
cd C:\Users\Zachg\clawd\memory\stanton-times

# Simple message
node send-embed.mjs --title "Title" --description "Body text"

# With color and footer
node send-embed.mjs --title "Alert" --description "Content" --color "0xED4245" --footer "Footer text"

# Full JSON control
node send-embed.mjs --json '{"title":"...", "description":"...", "color":1234, "fields":[...]}'

# Ping someone
node send-embed.mjs --title "Needs Review" --description "Draft ready" --ping "956203522624462918"
```

### 2. Reaction Confirmations: `reaction-confirm.mjs`
```powershell
node reaction-confirm.mjs "<emoji>" "<username>" "<msgId>" "[context]"

# Examples
node reaction-confirm.mjs "✅" "zap" "1234567890" "Weather alert draft"
node reaction-confirm.mjs "❌" "zap" "1234567890" "Rejected: needs sources"
```

## Reaction Handling

When you receive a system event like:
```
Discord reaction added: ✅ by 956203522624462918 on stanton-server #the-stanton-times msg 1234567890 from OpenClaw#7753
```

1. Parse: emoji=✅, user=956203522624462918 (zap), msgId=1234567890
2. Run: `node reaction-confirm.mjs "✅" "zap" "1234567890" "[context]"`
3. Take action based on emoji:
   - ✅ **Approved** → Execute pending action (post tweet, etc.)
   - ❌ **Rejected** → Cancel, update state
   - 🤔 **Hold** → Wait for more input

## Color Reference
- `0x57F287` — Green (success, approved)
- `0xED4245` — Red (error, rejected)  
- `0xFEE75C` — Yellow (warning, pending)
- `0x5865F2` — Blurple (info, neutral)
- `0x1DA1F2` — Twitter blue (default)

## IMPORTANT
- Every response in this channel → use webhook embed
- Never plain text, always formatted
- Keep consistent "The Stanton Times" branding
