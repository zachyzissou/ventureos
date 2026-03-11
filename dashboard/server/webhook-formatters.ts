/**
 * Webhook Payload Formatters — provider/channel-specific payload shaping.
 * Issue #219 — Phase 18: Provider-Specific Webhook Payload Formatters.
 *
 * Transforms the generic VentureOS webhook payload into provider-native
 * formats (Slack Block Kit, Discord Embeds, etc.) while preserving the
 * existing generic JSON payload as the default.
 *
 * Design:
 *   - Pure functions — no side effects, no external SDKs
 *   - Each formatter produces { body, headers } ready for HTTP delivery
 *   - The generic formatter is always the fallback
 *   - Provider set is closed/validated — no arbitrary strings
 *   - HMAC signatures are computed over the final serialized body
 *     (downstream of formatting), so security posture is preserved
 *
 * Supported providers:
 *   - 'generic'  — raw VentureOS JSON payload (default, backward-compatible)
 *   - 'slack'    — Slack Incoming Webhook (Block Kit + text fallback)
 *   - 'discord'  — Discord Webhook (Embeds)
 */

import type { WebhookPayload, WebhookTestPayload } from './alert-webhook.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Allowed webhook provider identifiers. */
export type WebhookProvider = 'generic' | 'slack' | 'discord';

/** The set of allowed provider strings for validation. */
export const ALLOWED_PROVIDERS: readonly WebhookProvider[] = ['generic', 'slack', 'discord'] as const;

/** Result of formatting a payload for delivery. */
export interface FormattedPayload {
  /** Serialized body string (JSON). */
  body: string;
  /** Content-Type header value. */
  contentType: string;
  /** Additional provider-specific headers to merge into the request. */
  extraHeaders: Record<string, string>;
}

/** Union of payload types the formatters can handle. */
export type AnyWebhookPayload = WebhookPayload | WebhookTestPayload;

// ─── Severity Helpers ────────────────────────────────────────────────────────

const SEVERITY_EMOJI: Record<string, string> = {
  ok: '✅',
  warning: '⚠️',
  critical: '🔴',
};

const SEVERITY_COLOR_SLACK: Record<string, string> = {
  ok: '#36a64f',       // green
  warning: '#f2c744',  // amber
  critical: '#e01e5a', // red
};

/** Discord embed colors are decimal integers. */
const SEVERITY_COLOR_DISCORD: Record<string, number> = {
  ok: 0x36a64f,       // green
  warning: 0xf2c744,  // amber
  critical: 0xe01e5a, // red
};

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Check whether a string is a valid webhook provider.
 * Pure function.
 */
export function isValidProvider(value: unknown): value is WebhookProvider {
  return typeof value === 'string' && (ALLOWED_PROVIDERS as readonly string[]).includes(value);
}

// ─── Generic Formatter (default — backward-compatible) ───────────────────────

/**
 * Format payload as raw VentureOS JSON.
 * This is the existing behavior — no transformation applied.
 */
export function formatGeneric(payload: AnyWebhookPayload): FormattedPayload {
  return {
    body: JSON.stringify(payload),
    contentType: 'application/json',
    extraHeaders: {},
  };
}

// ─── Slack Formatter ─────────────────────────────────────────────────────────

/**
 * Format an alert transition payload for Slack Incoming Webhooks.
 *
 * Uses Slack Block Kit for rich formatting with a plain-text fallback
 * in the `text` field (required by Slack for notifications/accessibility).
 *
 * Reference: https://api.slack.com/messaging/webhooks
 * Reference: https://api.slack.com/reference/block-kit
 */
function formatSlackAlert(payload: WebhookPayload): FormattedPayload {
  const severity = payload.currentSeverity;
  const emoji = SEVERITY_EMOJI[severity] ?? '❓';
  const color = SEVERITY_COLOR_SLACK[severity] ?? '#808080';

  // Plain-text fallback (shown in notifications)
  const fallbackText = `${emoji} ${payload.transitionLabel}`;

  // Rule summary lines
  const ruleLines = payload.evaluation.rules
    .filter((r) => r.enabled)
    .map((r) => {
      const ruleEmoji = SEVERITY_EMOJI[r.severity] ?? '•';
      const val = r.currentValue !== null ? r.currentValue.toFixed(1) : 'N/A';
      return `${ruleEmoji} *${r.label}*: ${val} — ${r.message}`;
    });

  const slackPayload = {
    text: fallbackText,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} VentureOS Alert`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${payload.transitionLabel}*`,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Previous:*\n${payload.previousSeverity ?? 'none'}`,
          },
          {
            type: 'mrkdwn',
            text: `*Current:*\n${payload.currentSeverity}`,
          },
          {
            type: 'mrkdwn',
            text: `*Timestamp:*\n${payload.timestampISO}`,
          },
          {
            type: 'mrkdwn',
            text: `*Source:*\n${payload.source}`,
          },
        ],
      },
      ...(ruleLines.length > 0
        ? [
            { type: 'divider' },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: ruleLines.join('\n'),
              },
            },
          ]
        : []),
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `VentureOS Dashboard • Schema v${payload.schemaVersion}`,
          },
        ],
      },
    ],
    // Attachment with color bar (sidebar accent)
    attachments: [
      {
        color,
        blocks: [],
      },
    ],
  };

  return {
    body: JSON.stringify(slackPayload),
    contentType: 'application/json',
    extraHeaders: {},
  };
}

/**
 * Format a test payload for Slack.
 */
function formatSlackTest(payload: WebhookTestPayload): FormattedPayload {
  const slackPayload = {
    text: '🔔 VentureOS Webhook Test Ping',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🔔 VentureOS Webhook Test',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: payload.message,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `_Test ping — ${payload.timestampISO}_ • ${payload.source}`,
          },
        ],
      },
    ],
  };

  return {
    body: JSON.stringify(slackPayload),
    contentType: 'application/json',
    extraHeaders: {},
  };
}

/**
 * Format any webhook payload for Slack.
 */
export function formatSlack(payload: AnyWebhookPayload): FormattedPayload {
  if (payload.event === 'webhook.test') {
    return formatSlackTest(payload as WebhookTestPayload);
  }
  return formatSlackAlert(payload as WebhookPayload);
}

// ─── Discord Formatter ───────────────────────────────────────────────────────

/**
 * Format an alert transition payload for Discord Webhooks.
 *
 * Uses Discord's embed format for rich cards with color-coded severity.
 *
 * Reference: https://discord.com/developers/docs/resources/webhook
 * Reference: https://discord.com/developers/docs/resources/message#embed-object
 */
function formatDiscordAlert(payload: WebhookPayload): FormattedPayload {
  const severity = payload.currentSeverity;
  const emoji = SEVERITY_EMOJI[severity] ?? '❓';
  const color = SEVERITY_COLOR_DISCORD[severity] ?? 0x808080;

  // Build rule fields for the embed
  const ruleFields = payload.evaluation.rules
    .filter((r) => r.enabled)
    .slice(0, 25) // Discord embeds max 25 fields
    .map((r) => {
      const ruleEmoji = SEVERITY_EMOJI[r.severity] ?? '•';
      const val = r.currentValue !== null ? r.currentValue.toFixed(1) : 'N/A';
      return {
        name: `${ruleEmoji} ${r.label}`,
        value: `Value: ${val}\n${r.message}`,
        inline: true,
      };
    });

  const discordPayload = {
    content: `${emoji} **${payload.transitionLabel}**`,
    embeds: [
      {
        title: `${emoji} VentureOS Alert`,
        description: payload.transitionLabel,
        color,
        fields: [
          {
            name: 'Previous Severity',
            value: payload.previousSeverity ?? 'none',
            inline: true,
          },
          {
            name: 'Current Severity',
            value: payload.currentSeverity,
            inline: true,
          },
          {
            name: 'Timestamp',
            value: payload.timestampISO,
            inline: true,
          },
          ...ruleFields,
        ],
        footer: {
          text: `VentureOS Dashboard • Schema v${payload.schemaVersion}`,
        },
        timestamp: payload.timestampISO,
      },
    ],
  };

  return {
    body: JSON.stringify(discordPayload),
    contentType: 'application/json',
    extraHeaders: {},
  };
}

/**
 * Format a test payload for Discord.
 */
function formatDiscordTest(payload: WebhookTestPayload): FormattedPayload {
  const discordPayload = {
    content: '🔔 **VentureOS Webhook Test Ping**',
    embeds: [
      {
        title: '🔔 Webhook Test',
        description: payload.message,
        color: 0x3b82f6, // blue
        footer: {
          text: `${payload.source} • Test Ping`,
        },
        timestamp: payload.timestampISO,
      },
    ],
  };

  return {
    body: JSON.stringify(discordPayload),
    contentType: 'application/json',
    extraHeaders: {},
  };
}

/**
 * Format any webhook payload for Discord.
 */
export function formatDiscord(payload: AnyWebhookPayload): FormattedPayload {
  if (payload.event === 'webhook.test') {
    return formatDiscordTest(payload as WebhookTestPayload);
  }
  return formatDiscordAlert(payload as WebhookPayload);
}

// ─── Formatter Registry ──────────────────────────────────────────────────────

/** Formatter function signature. */
export type PayloadFormatter = (payload: AnyWebhookPayload) => FormattedPayload;

/** Registry of provider → formatter. */
const FORMATTERS: Record<WebhookProvider, PayloadFormatter> = {
  generic: formatGeneric,
  slack: formatSlack,
  discord: formatDiscord,
};

/**
 * Get the appropriate formatter for a provider.
 * Falls back to generic if the provider is unknown.
 * Pure function.
 */
export function getFormatter(provider: WebhookProvider | undefined): PayloadFormatter {
  if (!provider || !FORMATTERS[provider]) {
    return FORMATTERS.generic;
  }
  return FORMATTERS[provider];
}

/**
 * Format a webhook payload for a specific provider.
 * Convenience wrapper around getFormatter().
 * Falls back to generic for unknown providers.
 * Pure function.
 */
export function formatPayload(
  payload: AnyWebhookPayload,
  provider?: WebhookProvider,
): FormattedPayload {
  const formatter = getFormatter(provider);
  return formatter(payload);
}
