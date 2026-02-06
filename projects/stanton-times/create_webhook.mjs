#!/usr/bin/env node
import { WebhookClient, Client, GatewayIntentBits } from 'discord.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const TOKEN_PATH = (process.env.STANTON_TIMES_DISCORD_BOT_TOKEN_FILE || '').trim()
  || path.join(os.homedir(), '.credentials', 'stanton_times_discord_bot_token');
const WEBHOOK_PATH = (process.env.STANTON_TIMES_DISCORD_WEBHOOK_FILE || '').trim()
  || path.join(os.homedir(), '.credentials', 'stanton_times_discord_webhook');
const CHANNEL_ID = (process.env.STANTON_TIMES_DISCORD_CHANNEL_ID || '').trim()
  || (process.env.STANTON_TIMES_DISCORD_VERIFICATION_CHANNEL_ID || '').trim()
  || '1207388252411453480';

function loadToken() {
  const env = (process.env.STANTON_TIMES_DISCORD_BOT_TOKEN || '').trim();
  if (env) return env;
  if (fs.existsSync(TOKEN_PATH)) return fs.readFileSync(TOKEN_PATH, 'utf8').trim();
  return '';
}

client.once('ready', async () => {
    try {
        const channel = client.channels.cache.get(CHANNEL_ID);
        
        if (!channel) {
            console.error('Channel not found');
            process.exit(1);
        }

        const webhook = await channel.createWebhook({
            name: 'Stanton Times Webhook',
            reason: 'Automated webhook for Stanton Times content'
        });

        const webhookUrl = `https://discord.com/api/webhooks/${webhook.id}/${webhook.token}`;
        
        fs.writeFileSync(WEBHOOK_PATH, webhookUrl);
        console.log('Webhook created successfully:', webhookUrl);
        
        client.destroy();
        process.exit(0);
    } catch (error) {
        console.error('Error creating webhook:', error);
        client.destroy();
        process.exit(1);
    }
});

const token = loadToken();
if (!token) {
    console.error('Missing Discord bot token. Set STANTON_TIMES_DISCORD_BOT_TOKEN or STANTON_TIMES_DISCORD_BOT_TOKEN_FILE.');
    process.exit(2);
}
client.login(token);
