import fetch from 'node-fetch';
import fs from 'fs';
import dotenv from 'dotenv';
import config from './config.js';
import chalk from 'chalk';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// Setup Express dashboard
const app = express();
const port = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', (req, res) => {
  res.json(global.statusInfo);
});

app.listen(port, () => {
  console.log(`🌐 Dashboard running at http://localhost:${port}`);
});

// Initialize status tracking
global.statusInfo = {
  timer: 0,
  currentTarget: null,
  lastRun: null,
  lastIds: {},
  errors: []
};

const BEARER_TOKEN = process.env.BEARER_TOKEN;
const LAST_ID_FILE = './last_ids.json';
const ERR_FILE = './error.log';

const DISCORD_ENABLED = process.env.DISCORD_ENABLED === 'true';
const DISCORD_TIME_GATE = process.env.DISCORD_TIME_GATE ? new Date(process.env.DISCORD_TIME_GATE).getTime() : null;
if (isNaN(DISCORD_TIME_GATE)) {
  logError(`Invalid DISCORD_TIME_GATE format: ${process.env.DISCORD_TIME_GATE}`);
}

const queue = [
  { type: 'hashtags', value: Object.keys(config.hashtags) },
  ...Object.keys(config.users).map(user => ({ type: 'user', value: user })),
];

let index = 0;
let timer = 1;

const args = process.argv.slice(2);
if (args.length > 0) {
  const startIndex = args.indexOf('-s');
  if (startIndex !== -1 && args[startIndex + 1]) {
    const minutes = parseInt(args[startIndex + 1], 10);
    if (!isNaN(minutes) && minutes > 0) {
      timer = minutes * 60;
    } else {
      logError('Startparameter Error. Invalid number of minutes provided. Defaulting to 1 second.');
    }
  } else {
    logError('Startparameter Error. Defaulting to 1 second.');
  }
}

function loadLastIds() {
  try {
    return JSON.parse(fs.readFileSync(LAST_ID_FILE));
  } catch {
    return { hashtags: {}, users: {} };
  }
}

function saveLastIds(data) {
  fs.writeFileSync(LAST_ID_FILE, JSON.stringify(data, null, 2));
}

function logError(error) {
  const timestamp = new Date().toISOString();
  const errorMessage = `[${timestamp}] ${error}`;
  console.error(errorMessage);
  fs.appendFileSync(ERR_FILE, errorMessage + '\n');
  global.statusInfo.errors.push(errorMessage);
}

async function getUserId(username) {
  const url = `https://api.twitter.com/2/users/by/username/${username}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${BEARER_TOKEN}` }
  });
  const data = await res.json();
  return data?.data?.id;
}

async function searchTweets(query, sinceId) {
  const url = new URL('https://api.twitter.com/2/tweets/search/recent');
  url.searchParams.append('query', `${query} -is:retweet -is:quote`);
  url.searchParams.append('tweet.fields', 'created_at,author_id,text');
  url.searchParams.append('max_results', '100');
  if (sinceId) url.searchParams.append('since_id', sinceId);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${BEARER_TOKEN}` }
  });
  const data = await res.json();
  if (data.status === 429) {
    logError("❌ Rate limit exceeded. Waiting for 15 minutes.");
  }
  return data?.data || [];
}

async function sendToDiscord(webhookUrl, tweet) {
  if (!DISCORD_ENABLED) {
    logError('Discord webhook is disabled. Skipping sendToDiscord.');
    return;
  }
  if (DISCORD_TIME_GATE) {
    const tweetDate = new Date(tweet.created_at).getTime();
    const currentDate = new Date().getTime();
    if (tweetDate < DISCORD_TIME_GATE) {
      logError(`Tweet from ${tweet.created_at} is older than time gate (${new Date(DISCORD_TIME_GATE).toISOString()}). Skipping.`);
      return;
    }
  }
  const content = `https://x.com/i/web/status/${tweet.id}`;
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
}

async function handleOneTarget() {
  const lastIds = loadLastIds();
  const current = queue[index];
  global.statusInfo.currentTarget = current;
  index = (index + 1) % queue.length;

  if (current.type === 'hashtags') {
    const allTags = current.value;
    const combinedQuery = allTags.map(tag => `${tag}`).join(' OR ');
    const sinceId = lastIds.hashtags.__combined || null;

    const tweets = await searchTweets(combinedQuery, sinceId);

    if (tweets.length > 0) {
      const tagBuckets = {};
      for (const tag of allTags) tagBuckets[tag] = [];

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
            if (tweet.text.startsWith('RT ')) continue;
            await sendToDiscord(webhook, tweet);
          }
        }
      }

      lastIds.hashtags.__combined = tweets[0].id;
    }

  } else if (current.type === 'user') {
    const username = current.value;
    const webhook = config.users[username];
    const userId = await getUserId(username);
    if (!userId) {
      logError(`User ${username} not found`);
      return;
    }

    const sinceId = lastIds.users[username];
    const tweets = await searchTweets(`from:${userId}`, sinceId);

    if (tweets.length > 0) {
      lastIds.users[username] = tweets[0].id;
      for (const tweet of tweets.reverse()) {
        if (tweet.text.startsWith('RT ')) continue;
        await sendToDiscord(webhook, tweet);
      }
    }
  }

  saveLastIds(lastIds);
  global.statusInfo.lastIds = lastIds;
  global.statusInfo.lastRun = new Date().toISOString();
}

function startCountdown() {
  const interval = setInterval(() => {
    global.statusInfo.timer = timer;
    timer--;

    if (timer <= 0) {
      clearInterval(interval);
      console.log('\n⏱️ Running task...');
      handleOneTarget().catch(error => logError(error.message));
      timer = 15 * 60;
      setTimeout(() => {
        startCountdown();
      }, 5000);
    }
  }, 1000);
}

startCountdown();
