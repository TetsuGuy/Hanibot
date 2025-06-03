import fs from 'fs';
import dotenv from 'dotenv';
import config from './config';
import BearerTokenManager from './BearerService';
import LoggerService from './LoggerService';
import DiscordService from './DiscordService';
import { initTimer } from './Init';
import LiveSubscriberCounter from './LiveSubscriberCounter';
import TwitterService from './TwitterService';
dotenv.config();
const REFRESH_RATE = process.env.REFRESH_RATE || 15 * 60;
const tokenBarrel = process.env.BEARER_TOKENS?.split(',') ?? [];
const discordWebhooks = config.webhooks;
const loggerService = new LoggerService();
const bearerTokenManager = new BearerTokenManager(tokenBarrel);
const bearerToken = bearerTokenManager.getCurrentToken();
const twitterService = new TwitterService({ bearerToken, logger: loggerService });
const discordService = new DiscordService(discordWebhooks, loggerService);
const LAST_ID_FILE = './last_ids.json';
const LOG_FILE = './log.log';
const ERR_FILE = './error.log';
const DISCORD_ENABLED = process.env.DISCORD_ENABLED === 'true';
const DISCORD_TIME_GATE = process.env.DISCORD_TIME_GATE ? new Date(process.env.DISCORD_TIME_GATE).getTime() : null;
const YT_API_KEY = process.env.YT_API_KEY;
const YT_USER_ID = process.env.YT_USER_ID;
let index = 0;
let timer = initTimer(1, loggerService);
let liveSubscribeService = null;
const queue = [
    { type: 'hashtags', value: Object.keys(config.hashtags) },
    ...Object.keys(config.users).map(user => ({ type: 'user', value: user })),
];
let statusInfo = {
    timer: 0,
    timerMax: REFRESH_RATE,
    currentTarget: null,
    lastRun: null,
    lastIds: {},
    logs: [],
    errors: []
};
if (isNaN(DISCORD_TIME_GATE)) {
    loggerService.error(`Invalid DISCORD_TIME_GATE format: ${process.env.DISCORD_TIME_GATE}`);
}
if (YT_API_KEY && YT_USER_ID) {
    liveSubscribeService = new LiveSubscriberCounter(YT_API_KEY, YT_USER_ID, loggerService);
}
else {
    loggerService.error('YouTube API key or User ID not provided. Live subscriber count will not be available.');
}
// -> in Global State Manager
function loadLastIds() {
    try {
        return JSON.parse(fs.readFileSync(LAST_ID_FILE));
    }
    catch {
        return {};
    }
}
// -> in Global State Manager
function saveLastIds(data) {
    fs.writeFileSync(LAST_ID_FILE, JSON.stringify(data, null, 2));
}
// -> simplify
async function handleOneTarget() {
    const lastIds = loadLastIds();
    const current = queue[index];
    statusInfo.currentTarget = current;
    index = (index + 1) % queue.length;
    if (current.type === 'hashtags') {
        const allTags = current.value;
        const combinedQuery = allTags.map(tag => `${tag}`).join(' OR ');
        const sinceId = lastIds.combined || null;
        const tweets = await twitterService.searchTweets(combinedQuery, sinceId);
        if (tweets.length > 0) {
            const tagBuckets = {};
            for (const tag of allTags)
                tagBuckets[tag] = [];
            for (const tweet of tweets) {
                const text = tweet.text.toLowerCase();
                for (const tag of allTags) {
                    if (text.includes(tag.toLowerCase())) {
                        tagBuckets[tag].push(tweet);
                    }
                }
            }
            for (const tag of allTags) {
                const webhook = config.hashtags[tag];
                const taggedTweets = tagBuckets[tag];
                if (taggedTweets.length > 0) {
                    for (const tweet of taggedTweets.reverse()) {
                        if (tweet.text.startsWith('RT '))
                            continue;
                        await sendToDiscord(webhook, tweet);
                    }
                }
            }
            lastIds.combined = tweets[0].id;
        }
    }
    else if (current.type === 'user') {
        const username = current.value;
        const webhook = config.users[username];
        const userId = await getUserId(username);
        if (!userId) {
            logError(`User ${username} not found`);
            return;
        }
        const sinceId = lastIds.user;
        const tweets = await searchUserTweets(userId, sinceId);
        if (tweets.length > 0) {
            lastIds.user = tweets[0].id;
            for (const tweet of tweets.reverse()) {
                if (tweet.text.startsWith('RT '))
                    continue;
                await sendToDiscord(webhook, tweet);
            }
        }
    }
    saveLastIds(lastIds);
    statusInfo.lastIds = lastIds;
    statusInfo.lastRun = getLocalDate();
}
const getLocalDate = () => (new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }));
// -> update() function
function startCountdown() {
    const interval = setInterval(() => {
        statusInfo.timer = timer;
        timer--;
        if (timer <= 0) {
            clearInterval(interval);
            console.log('\n⏱️ Running task...');
            statusInfo.subscriberCount = liveSubscribeService ? liveSubscribeService.subscriberCount.toString() : "N/A";
            handleOneTarget().catch(error => logError(error.message));
            timer = REFRESH_RATE;
            setTimeout(() => {
                startCountdown();
            }, 5000);
        }
    }, 1000);
}
startCountdown();
