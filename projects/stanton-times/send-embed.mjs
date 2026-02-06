#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';
import fetch from 'node-fetch';
import minimist from 'minimist';

const args = minimist(process.argv.slice(2));

function resolveWebhookUrl() {
    const envUrl = (process.env.STANTON_TIMES_DISCORD_WEBHOOK_URL || '').trim();
    if (envUrl) return envUrl;

    const webhookFile = (process.env.STANTON_TIMES_DISCORD_WEBHOOK_FILE || '').trim()
        || path.join(os.homedir(), '.credentials', 'stanton_times_discord_webhook');

    if (fs.existsSync(webhookFile)) {
        return fs.readFileSync(webhookFile, 'utf8').trim();
    }
    return '';
}

const webhookUrl = resolveWebhookUrl();
if (!webhookUrl) {
    console.error('Discord webhook URL not configured. Set STANTON_TIMES_DISCORD_WEBHOOK_URL or STANTON_TIMES_DISCORD_WEBHOOK_FILE.');
    process.exit(2);
}

async function sendEmbed() {
    const payload = {
        content: args.title || 'Stanton Times Update',
        embeds: [{
            description: args.description || 'No description provided',
            color: 5763719
        }]
    };

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const responseText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, body: ${responseText}`);
        }

        console.log('Embed sent successfully');
    } catch (error) {
        console.error('Error sending embed:', error);
        process.exit(1);
    }
}

sendEmbed();
