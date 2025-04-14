import fetch from 'node-fetch';
import fs from 'fs';
import dotenv from 'dotenv';
import config from './config.js';
import chalk from 'chalk';

dotenv.config();

const BEARER_TOKEN = process.env.BEARER_TOKEN;
const LAST_ID_FILE = './last_ids.json';
const ERR_FILE = './error.log';

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
  console.error(chalk.red(errorMessage))
  fs.appendFileSync(ERR_FILE, errorMessage);
}

async function getUserId(username) {
  const url = `https://api.twitter.com/2/users/by/username/${username}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${BEARER_TOKEN}` }
  });
  const data = await res.json();
  console.log("📦 Raw response:", JSON.stringify(data));
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
    console.log("❌ Rate limit exceeded. Waiting for 15 minutes.");
  } else if(data.meta && data.meta.result_count === 0) {
    console.log("❌ No new tweets found.");
  } else {
    console.log("📦 Raw response:", JSON.stringify(data, null, 2));
  }
  return data?.data || [];
}

async function sendToDiscord(webhookUrl, tweet) {
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
  index = (index + 1) % queue.length;

  if (current.type === 'hashtags') {
    const allTags = current.value;
    const combinedQuery = allTags.map(tag => `${tag}`).join(' OR ');
    const sinceId = lastIds.hashtags.__combined || null;

    const tweets = await searchTweets(combinedQuery, sinceId);

    if (tweets.length > 0) {
      // Distribute tweets into tag buckets
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

      // Send tweets per tag to respective Discord webhooks
      for (const tag of allTags) {
        const webhook = config.hashtags[tag];
        const taggedTweets = tagBuckets[tag];
        if (taggedTweets.length > 0) {
          for (const tweet of taggedTweets.reverse()) {
            if (tweet.text.startsWith('RT ')) {
              console.log(`❌ Skipping retweet: ${tweet.id}`);
              continue;
            }
            await sendToDiscord(webhook, tweet);
          }
        }
      }

      lastIds.hashtags.__combined = tweets[0].id;
    } else {
      console.log(`No new tweets for any hashtags`);
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
        console.log("Tweet:", tweet.text);
        if (tweet.text.startsWith('RT ')) {
          console.log(`❌ Skipping retweet: ${tweet.id}`);
          continue;
        }
        await sendToDiscord(webhook, tweet);
      }
    } else {
      console.log(`No new tweets from ${username}`);
    }
  }

  saveLastIds(lastIds);
}

function startCountdown() {
  const interval = setInterval(() => {
    timer--;

    const minutes = Math.floor(timer / 60);
    const seconds = timer % 60;

    const barLength = 30;
    const progress = Math.floor((1 - timer / (15 * 60)) * barLength);

    const filledBar = chalk.hex('#B5C84A')('█').repeat(progress);         // Pale green
    const emptyBar = chalk.hex('#607F14')('░').repeat(barLength - progress); // Olive
    const timeText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    const label = chalk.hex('#F3BF4B')('Next check in');

    const bar = filledBar + emptyBar;

    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    process.stdout.write(`${label} ${timeText} [${bar}]`);

    if (timer <= 0) {
      clearInterval(interval);
      console.log('\n');
      handleOneTarget().catch(error => {
        logError(error.message);
      });
      timer = 15 * 60;
      // Reset the countdown timer, gives 5 seconds delay to finish the current task
      setTimeout(() => {
        startCountdown();
      }, 5000);
    }
  }, 1000);
}

startCountdown();
