#!/usr/bin/env node
/**
 * The Stanton Times - Discord Webhook Embed Poster
 * 
 * Usage:
 *   node post-embed.mjs --type news --source "@RobertsSpaceInd" --topic "Alpha 4.6" --original "They said..." --draft "Our tweet..."
 *   node post-embed.mjs --type breaking --source "@RobertsSpaceInd" --topic "SQ42 Gold" --original "..." --draft "..."
 *   node post-embed.mjs --type quiet
 *   node post-embed.mjs --type engagement --account "@user" --context "They said..." --reply "Our reply..."
 *   node post-embed.mjs --type digest --stats '{"tweets":5,"likes":120,"rts":30}'
 *   
 * Or with JSON:
 *   node post-embed.mjs --json '{"type":"news","source":"@RobertsSpaceInd",...}'
 * 
 * Environment:
 *   STANTON_WEBHOOK_URL - Discord webhook URL (required)
 */

import { parseArgs } from 'node:util';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env file
try {
  const envPath = join(__dirname, '.env');
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
} catch (e) {
  // .env not found, rely on environment
}

const WEBHOOK_URL = process.env.STANTON_WEBHOOK_URL;

// Brand colors
const COLORS = {
  news: 0x5865F2,      // Discord blurple
  breaking: 0xED4245,  // Red
  quiet: 0x57F287,     // Green
  engagement: 0xFEE75C, // Yellow
  digest: 0x9B59B6,    // Purple
  error: 0x95A5A6      // Gray
};

// Embed templates
function buildEmbed(data) {
  const { type } = data;
  
  switch (type) {
    case 'news':
    case 'draft':
      return buildNewsEmbed(data);
    case 'breaking':
      return buildBreakingEmbed(data);
    case 'quiet':
      return buildQuietEmbed(data);
    case 'engagement':
      return buildEngagementEmbed(data);
    case 'digest':
      return buildDigestEmbed(data);
    default:
      return buildGenericEmbed(data);
  }
}

function buildNewsEmbed({ source, topic, priority, original, draft, sourceUrl }) {
  return {
    embeds: [{
      author: {
        name: "The Stanton Times",
        icon_url: "https://pbs.twimg.com/profile_images/1927617270894493696/tKqgVvOp_400x400.jpg"
      },
      title: "📰 Draft Ready",
      color: COLORS.news,
      fields: [
        {
          name: "📌 Source",
          value: sourceUrl ? `[${source}](${sourceUrl})` : source,
          inline: true
        },
        {
          name: "📌 Topic", 
          value: topic,
          inline: true
        },
        {
          name: "📌 Priority",
          value: priority || "P1 — Standard",
          inline: true
        },
        {
          name: "Original Tweet",
          value: original?.substring(0, 1024) || "*No original provided*"
        },
        {
          name: "Our Draft",
          value: `\`\`\`\n${draft?.substring(0, 1000) || "No draft"}\n\`\`\``
        }
      ],
      footer: {
        text: "✅ Approve  •  ❌ Reject  •  📝 Edit"
      },
      timestamp: new Date().toISOString()
    }]
  };
}

function buildBreakingEmbed({ source, topic, original, draft, sourceUrl, postedAt }) {
  return {
    embeds: [{
      author: {
        name: "The Stanton Times",
        icon_url: "https://pbs.twimg.com/profile_images/1927617270894493696/tKqgVvOp_400x400.jpg"
      },
      title: "🚨 BREAKING NEWS",
      color: COLORS.breaking,
      fields: [
        {
          name: "⚠️ Priority",
          value: "**P0 — IMMEDIATE**",
          inline: true
        },
        {
          name: "📌 Source",
          value: sourceUrl ? `[${source}](${sourceUrl})` : source,
          inline: true
        },
        {
          name: "🕐 Posted",
          value: postedAt || "Just now",
          inline: true
        },
        {
          name: "Original Tweet",
          value: original?.substring(0, 1024) || "*No original*"
        },
        {
          name: "Our Draft",
          value: `\`\`\`diff\n+ ${draft?.replace(/\n/g, '\n+ ')?.substring(0, 950) || "No draft"}\n\`\`\``
        }
      ],
      footer: {
        text: "🔴 Fast approval requested — Breaking news"
      },
      timestamp: new Date().toISOString()
    }]
  };
}

function buildQuietEmbed({ sources, nextCheck }) {
  return {
    embeds: [{
      author: {
        name: "The Stanton Times",
        icon_url: "https://pbs.twimg.com/profile_images/1927617270894493696/tKqgVvOp_400x400.jpg"
      },
      title: "📰 All Quiet",
      color: COLORS.quiet,
      description: "No newsworthy activity detected.",
      fields: [
        {
          name: "📊 Sources Checked",
          value: sources || "P0 Official • P1 Keywords • P2 Events"
        }
      ],
      footer: {
        text: nextCheck || "Next check in 30 min"
      },
      timestamp: new Date().toISOString()
    }]
  };
}

function buildEngagementEmbed({ account, context, reply, type: engagementType }) {
  return {
    embeds: [{
      author: {
        name: "The Stanton Times", 
        icon_url: "https://pbs.twimg.com/profile_images/1927617270894493696/tKqgVvOp_400x400.jpg"
      },
      title: "💬 Engagement Opportunity",
      color: COLORS.engagement,
      fields: [
        {
          name: "📌 Account",
          value: account || "Unknown",
          inline: true
        },
        {
          name: "📌 Type",
          value: engagementType || "Reply",
          inline: true
        },
        {
          name: "They Said",
          value: context?.substring(0, 1024) || "*No context*"
        },
        {
          name: "Proposed Response",
          value: `\`\`\`\n${reply?.substring(0, 1000) || "No reply drafted"}\n\`\`\``
        }
      ],
      footer: {
        text: "✅ Approve  •  ❌ Skip  •  📝 Edit"
      },
      timestamp: new Date().toISOString()
    }]
  };
}

function buildDigestEmbed({ stats, pending, tomorrow }) {
  const s = typeof stats === 'string' ? JSON.parse(stats) : (stats || {});
  
  return {
    embeds: [{
      author: {
        name: "The Stanton Times",
        icon_url: "https://pbs.twimg.com/profile_images/1927617270894493696/tKqgVvOp_400x400.jpg"
      },
      title: "📰 Daily Digest",
      color: COLORS.digest,
      fields: [
        {
          name: "📊 Today's Activity",
          value: [
            `├ Tweets posted: \`${s.tweets || 0}\``,
            `├ Impressions: \`${s.impressions || 'N/A'}\``,
            `├ Engagements: \`${s.likes || 0} likes • ${s.rts || 0} RTs\``,
            `└ Replies sent: \`${s.replies || 0}\``
          ].join('\n')
        },
        {
          name: "📋 Pending Queue",
          value: pending || "No pending items"
        },
        {
          name: "📅 Tomorrow",
          value: tomorrow || "No scheduled events"
        }
      ],
      footer: {
        text: "Generated"
      },
      timestamp: new Date().toISOString()
    }]
  };
}

function buildGenericEmbed({ title, description, fields }) {
  return {
    embeds: [{
      author: {
        name: "The Stanton Times",
        icon_url: "https://pbs.twimg.com/profile_images/1927617270894493696/tKqgVvOp_400x400.jpg"
      },
      title: title || "📰 Update",
      color: COLORS.news,
      description: description,
      fields: fields || [],
      timestamp: new Date().toISOString()
    }]
  };
}

// Main
async function main() {
  if (!WEBHOOK_URL) {
    console.error('Error: STANTON_WEBHOOK_URL environment variable not set');
    console.error('Set it in memory/stanton-times/.env or export it');
    process.exit(1);
  }

  // Zach's Discord user ID for mentions
  const NOTIFY_USER_ID = process.env.STANTON_NOTIFY_USER || '956203522624462918';

  const { values } = parseArgs({
    options: {
      json: { type: 'string' },
      type: { type: 'string', default: 'news' },
      ping: { type: 'boolean', default: true },
      source: { type: 'string' },
      sourceUrl: { type: 'string' },
      topic: { type: 'string' },
      priority: { type: 'string' },
      original: { type: 'string' },
      draft: { type: 'string' },
      postedAt: { type: 'string' },
      account: { type: 'string' },
      context: { type: 'string' },
      reply: { type: 'string' },
      stats: { type: 'string' },
      pending: { type: 'string' },
      tomorrow: { type: 'string' },
      sources: { type: 'string' },
      nextCheck: { type: 'string' },
      title: { type: 'string' },
      description: { type: 'string' }
    },
    strict: false
  });

  const data = values.json ? JSON.parse(values.json) : values;
  const payload = buildEmbed(data);

  // Add ping to content if enabled (default: true)
  if (values.ping !== false && data.type !== 'quiet') {
    payload.content = `<@${NOTIFY_USER_ID}>`;
  }

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`Webhook error ${res.status}: ${text}`);
      process.exit(1);
    }

    console.log('✅ Embed posted successfully');
  } catch (err) {
    console.error('Failed to post:', err.message);
    process.exit(1);
  }
}

main();
