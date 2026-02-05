#!/usr/bin/env node
import { WebhookClient, Client, GatewayIntentBits } from 'discord.js';
import fs from 'fs';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const TOKEN_PATH = '/Users/zachgonser/.credentials/stanton_times_discord_token';
const WEBHOOK_PATH = '/Users/zachgonser/.credentials/stanton_times_discord_webhook';
const CHANNEL_ID = '1207388252411453480';

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

client.login(fs.readFileSync(TOKEN_PATH, 'utf8').trim());