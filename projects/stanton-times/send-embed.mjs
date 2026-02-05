#!/usr/bin/env node
import fs from 'fs';
import fetch from 'node-fetch';
import minimist from 'minimist';

const args = minimist(process.argv.slice(2));
const webhookUrl = fs.readFileSync('/Users/zachgonser/.credentials/stanton_times_discord_webhook', 'utf8').trim();

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