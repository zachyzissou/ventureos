#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import minimist from 'minimist';

const args = minimist(process.argv.slice(2));

// Load webhook URL
const webhookUrl = fs.readFileSync('/Users/zachgonser/.credentials/stanton_times_discord_webhook', 'utf8').trim();

async function sendEmbed() {
    let embedPayload = {
        embeds: [{
            title: args.title || 'Stanton Times Update',
            description: args.description || 'No description provided',
            color: parseInt(args.color || '5865242', 16),
            footer: args.footer ? { text: args.footer } : undefined
        }]
    };

    // If JSON provided, use it directly
    if (args.json) {
        try {
            embedPayload = JSON.parse(args.json);
        } catch (error) {
            console.error('Invalid JSON:', error);
            process.exit(1);
        }
    }

    try {
        console.log('Webhook URL:', webhookUrl);
        console.log('Payload:', JSON.stringify(embedPayload, null, 2));

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(embedPayload)
        });

        console.log('Response status:', response.status);
        const responseText = await response.text();
        console.log('Response text:', responseText);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        console.log('Embed sent successfully');
    } catch (error) {
        console.error('Error sending embed:', error);
        process.exit(1);
    }
}

sendEmbed();