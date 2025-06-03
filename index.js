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

app.listen(port, "0.0.0.0", () => {
  console.log(`🌐 Dashboard running at http://localhost:${port}`);
});

const REFRESH_RATE = process.env.REFRESH_RATE || 15 * 60;

// Initialize status tracking
global.statusInfo = {
  timer: 0,
  timerMax: REFRESH_RATE,
  currentTarget: null,
  lastRun: null,
  lastIds: {},
  logs: [],
  errors: []
};

const getLocalDate = () => (new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }));

function logError(error) {
  const timestamp = getLocalDate();
  const errorMessage = `[${timestamp}] ${error}`;
  console.error(errorMessage);
  fs.appendFileSync(ERR_FILE, errorMessage + '\n');
  global.statusInfo.errors.push(errorMessage);
}

function logInfo(info) {
  const timestamp = getLocalDate();
  const infoMessage = `[${timestamp}] ${info}`;
  console.log(chalk.green(infoMessage));
  fs.appendFileSync(LOG_FILE, infoMessage + '\n');
  global.statusInfo.logs.push(infoMessage);
}

function logWarning(warning) {
  const timestamp = getLocalDate();
  const warningMessage = `[${timestamp}] ${warning}`;
  console.warn(chalk.yellow(warningMessage));
  fs.appendFileSync(LOG_FILE, warningMessage + '\n');
  global.statusInfo.logs.push(warningMessage);  
}

let bearerTokenIndex = 0;
function getBearerToken() {
  const BEARER_TOKENS = process.env.BEARER_TOKEN ? process.env.BEARER_TOKENS.split(',').map(k => k.trim()).filter(Boolean) : [];
  if (BEARER_TOKENS.length === 0) {
    logError("Error getting new Bearer Token");
    return undefined;
  }
  const token = BEARER_TOKENS[bearerTokenIndex];
  bearerTokenIndex = (bearerTokenIndex + 1) % BEARER_TOKENS.length;
  logInfo(`New BearerToken Index:${bearerTokenIndex}`);
  return token;
}
let bearerToken = getBearerToken();

const twitterUserName = process.env.TWITTER_USER_NAME;
if (!twitterUserName) {
   logError('Invalid or not provided: TWITTER USER NAME');
}
const LAST_ID_FILE = './last_ids.json';
const LOG_FILE = './log.log';
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



async function getUserId(username) {
  const url = `https://api.twitter.com/2/users/by/username/${username}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${bearerToken}` }
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
    headers: { Authorization: `Bearer ${bearerToken}` }
  });
  const data = await res.json();
  inspectResponse(res, data);
  return data?.data || [];
}

function inspectResponse(res, data) {
  logInfo(`Response:${JSON.stringify(data)}`);
  // CLIENT ERRORS
  if (String(res.status).startsWith('4')) {
    logError("Client Error 4XX");
    // unauthorized or usage cap hit
    if (res.status === 401 || res.json().title === "UsageCapExceeded") {
      logInfo("Getting new Bearer Token");
      bearerToken = getBearerToken();
    }
    return;
  }
  // SERVER ERRORS
  if (String(res.status).startsWith('4')) {
    logError("Client Error 4XX");
    return;
  }
}

async function searchUserTweets(userName, sinceId) {
  const url = new URL('https://api.twitter.com/2/tweets/search/recent');
  // Include all tweets from the user, including replies, excluding retweets & quotes
  url.searchParams.append('query', `from:${userName}`);
  url.searchParams.append('tweet.fields', 'created_at,author_id,text');
  url.searchParams.append('max_results', '100');
  if (sinceId) url.searchParams.append('since_id', sinceId);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${bearerToken}` }
  });

  const data = await res.json(); 
  inspectResponse(res, data);
  return data?.data || [];
}

async function sendToDiscord(webhookUrl, tweet) {
  if (!DISCORD_ENABLED) {
    logWarning('Discord webhook is disabled. Skipping sendToDiscord.');
    return;
  }
  if (DISCORD_TIME_GATE) {
    const tweetDate = new Date(tweet.created_at).getTime();
    if (tweetDate < DISCORD_TIME_GATE) {
      logWarning(`Tweet ${tweet.id} is too old. Skipping.`);
      return;
    }
  }
  logInfo(`Sending tweet ${tweet.id} to Discord.`);
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
    const sinceId = lastIds.users[username];
    const tweets = await searchUserTweets(twitterUserName, sinceId);

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
  global.statusInfo.lastRun = getLocalDate();
}


function startCountdown() {
  const interval = setInterval(() => {
    global.statusInfo.timer = timer;
    timer--;

    if (timer <= 0) {
      clearInterval(interval);
      console.log('\n⏱️ Running task...');
      handleOneTarget().catch(error => logError(error.message));
      timer = REFRESH_RATE;
      setTimeout(() => {
        startCountdown();
      }, 5000);
    }
  }, 1000);
}

startCountdown();
