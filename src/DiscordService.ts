import fetch from 'node-fetch';
import { Logger } from './types';

interface DiscordWebhookConfig {
    id: string;
    name: string;
    url?: string;
    enabled?: boolean;
    timeGate?: number | null;
}

interface DiscordServiceConfig {
    [key: string]: DiscordWebhookConfig;
}

interface Tweet {
    id: string;
    created_at: string;
}

class DiscordService {
    private config = null as DiscordServiceConfig | null;
    private logger = null as Logger | null;

    constructor(config: DiscordServiceConfig, logger?: Logger) {
        this.config = config;
        this.logger = logger || null;
    }

    async sendToDiscord(tweet: Tweet, id: DiscordWebhookConfig["id"]): Promise<void> {
        const webhook = this.config?.[id];
        if (!webhook) {
            this.logger?.error(`Webhook with ID ${id} not found.`);
            return;
        }
        if (!webhook.enabled) {
            this.logger?.warning('Discord webhook is disabled. Skipping sendToDiscord.');
            return;
        }
        if (!webhook.url) {
            this.logger?.error('Discord webhook URL is missing. Skipping sendToDiscord.');
            return;
        }
        if (webhook.timeGate) {
            const tweetDate = new Date(tweet.created_at).getTime();
            if (tweetDate < webhook.timeGate) {
                this.logger?.warning(`Tweet ${tweet.id} is too old. Skipping.`);
                return;
            }
        }
        this.logger?.info(`Sending tweet ${tweet.id} to Discord via webhook ${webhook.name}`);
        const content = `https://x.com/i/web/status/${tweet.id}`;
        await fetch(webhook.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
    }
}

export default DiscordService;