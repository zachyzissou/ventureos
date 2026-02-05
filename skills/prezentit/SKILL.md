---
name: prezentit
description: Generate beautiful AI-powered presentations instantly. Create professional slides with custom themes, visual designs, and speaker notes—all through natural language commands. Connect your Prezentit account to generate presentations directly from chat.
homepage: https://prezentit.net
emoji: "👽"
metadata:
  openclaw:
    emoji: "👽"
    skillKey: prezentit
    homepage: https://prezentit.net
    requires:
      config:
        - PREZENTIT_API_KEY
    config:
      requiredEnv:
        - name: PREZENTIT_API_KEY
          description: Your Prezentit API key. Get one at https://prezentit.net/api-keys (requires account)
      example: |
        # Add to your environment or OpenClaw config
        export PREZENTIT_API_KEY=pk_your_api_key_here
---

# Prezentit - AI Presentation Generator

Generate stunning presentations instantly with AI. Describe your topic and get a complete slide deck with custom designs.

## Quick Start

1. **Get API Key**: Sign in at [prezentit.net](https://prezentit.net) → Profile → API → Create Key
2. **Configure**: `/config set PREZENTIT_API_KEY pk_your_key_here`
3. **Generate**: "Create a presentation about sustainable energy"

## Features

- **40+ Themes**: Minimalist, Corporate, Creative, Nature, Tech, Education
- **AI-Designed Slides**: Each slide uniquely designed to match content  
- **External Outlines**: Provide your own outline to save credits (33% savings)
- **Direct Download**: Get your presentation link immediately

## Pricing

| Action | Credits |
|--------|---------|
| Outline (per slide) | 5 credits |
| Design (per slide) | 10 credits |
| **Total per slide** | **15 credits** |
| **With your outline** | **10 credits** (design only) |

New accounts: 100 free credits. Purchase more at [prezentit.net/buy-credits](https://prezentit.net/buy-credits)

## API Quick Reference

**Base URL**: `https://prezentit.net/api/v1`  
**Auth**: `Authorization: Bearer pk_your_api_key_here`

### Essential Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /me/credits` | Check your credit balance |
| `GET /themes` | List available themes |
| `GET /themes?search=NAME` | Find theme by name |
| `POST /presentations/generate` | Generate presentation |
| `GET /docs/outline-format` | **Get outline validation rules** |

### Generate Presentation

```json
POST /presentations/generate

{
  "topic": "Your topic (required)",
  "details": "Additional context (optional)",
  "slideCount": 5,           // 3-50, default: 5
  "theme": "minimalist",     // Theme ID from /themes
  "outline": { ... }         // Optional: provide your own outline
}
```

**Theme Selection**: Either provide `theme` (from /themes) OR `customDesignPrompt` for custom styles.

### External Outlines (Save 33% Credits)

You can provide your own outline to skip AI outline generation. This is useful when:
- You have specific content requirements
- You want to save credits
- An external AI (like OpenClaw) generates the outline

**Get the exact format requirements**:
```bash
GET /api/v1/docs/outline-format
```

This endpoint returns:
- All validation constraints (min/max words, characters, slide counts)
- Required fields for each slide
- Example outline structure
- Error fix suggestions

**Important**: Presentations with external outlines cannot be shared to the community feed (but can have public view links).

### Example with External Outline

```json
{
  "topic": "Machine Learning Basics",
  "theme": "minimalist",
  "outline": {
    "slides": [
      {
        "title": "Introduction to Machine Learning",
        "mainIdea": "Machine learning enables computers to learn from data...",
        "talkingPoints": [
          "Definition and core principles",
          "How ML differs from traditional programming",
          "Key applications in everyday life"
        ],
        "visualGuide": "Split-screen comparison of traditional programming vs ML..."
      }
      // ... more slides
    ]
  }
}
```

### Error Handling

When outline validation fails, you'll receive detailed errors:

```json
{
  "error": "Invalid outline format",
  "code": "INVALID_OUTLINE",
  "validationErrors": [
    {
      "slide": 1,
      "field": "title",
      "error": "Title must be between 3-100 characters",
      "value": "ML",
      "fix": "Expand the title to at least 3 characters"
    }
  ],
  "constraints": { ... },
  "documentation": "https://prezentit.net/api/v1/docs/outline-format"
}
```

### Common Errors

| Code | Meaning |
|------|---------|
| 401 | Invalid/missing API key |
| 402 | Insufficient credits |
| 429 | Rate limited (retry after 60s) |

## Best Practices for OpenClaw

1. **Always check credits first** before generating
2. **Search themes** when user requests a specific style
3. **Use outline format endpoint** to get current validation rules before generating outlines
4. **Handle validation errors** - they include fix suggestions
5. **Inform user** about external outline restrictions (no community feed sharing)

## Support

- **Website**: [prezentit.net](https://prezentit.net)
- **API Docs**: Call `GET /api/v1/docs/outline-format` for live documentation
