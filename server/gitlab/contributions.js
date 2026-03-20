/**
 * Fetch GitLab contribution stats via the public calendar endpoint
 * (/users/:username/calendar.json).
 *
 * Returns daily contribution counts for roughly the last year.
 * One request per user — no pagination, no user ID resolution needed.
 *
 * Uses node-fetch (v2) for HTTP requests.
 */

const fetch = require('node-fetch');

const GITLAB_BASE_URL = process.env.GITLAB_BASE_URL || 'https://gitlab.com';
const DEFAULT_CONCURRENCY = 5;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a shared rate limiter that enforces a maximum request rate.
 * All concurrent workers share a single limiter instance.
 */
function createRateLimiter(maxPerSecond) {
  const minIntervalMs = 1000 / maxPerSecond;
  let lastRequestTime = 0;
  let pending = Promise.resolve();

  return function acquire() {
    pending = pending.then(async () => {
      const now = Date.now();
      const elapsed = now - lastRequestTime;
      if (elapsed < minIntervalMs) {
        await delay(minIntervalMs - elapsed);
      }
      lastRequestTime = Date.now();
    });
    return pending;
  };
}

/**
 * Bucket daily contributions { "YYYY-MM-DD": count } into monthly { "YYYY-MM": count }.
 */
function bucketByMonth(daily) {
  const months = {};
  for (const [date, count] of Object.entries(daily)) {
    const monthKey = date.slice(0, 7);
    months[monthKey] = (months[monthKey] || 0) + count;
  }
  return months;
}

/**
 * Fetch the contribution calendar for a single GitLab user.
 * @param {string} username
 * @param {Function} rateLimiter
 * @returns {Object|null} { totalContributions, months, fetchedAt } or null
 */
async function fetchUserCalendar(username, rateLimiter) {
  await rateLimiter();
  const url = `${GITLAB_BASE_URL}/users/${encodeURIComponent(username)}/calendar.json`;
  const res = await fetch(url, { timeout: 15000 });
  if (!res.ok) return null;
  const daily = await res.json();
  if (!daily || typeof daily !== 'object') return null;

  const months = bucketByMonth(daily);
  const totalContributions = Object.values(months).reduce((a, b) => a + b, 0);
  return { totalContributions, months, fetchedAt: new Date().toISOString() };
}

/**
 * Fetch GitLab data (contributions + history) for a list of usernames.
 *
 * @param {string[]} usernames - GitLab usernames to query
 * @param {object} [options]
 * @param {number} [options.concurrency] - Number of concurrent workers (default 5)
 * @returns {Object} Map of username -> { totalContributions, months, fetchedAt } or null
 */
async function fetchGitlabData(usernames, options = {}) {
  const concurrency = options.concurrency || DEFAULT_CONCURRENCY;
  // 10 req/sec — generous but respectful for a simple JSON endpoint
  const rateLimiter = createRateLimiter(10);

  console.log(`[gitlab] Fetching data for ${usernames.length} users (concurrency: ${concurrency})`);

  const results = {};
  let idx = 0;
  let completed = 0;

  async function worker() {
    while (idx < usernames.length) {
      const i = idx++;
      const username = usernames[i];

      try {
        const data = await fetchUserCalendar(username, rateLimiter);
        results[username] = data;
        completed++;
        if (data) {
          console.log(`[gitlab] ${username}: ${data.totalContributions} contributions (${completed}/${usernames.length})`);
        } else {
          console.log(`[gitlab] ${username}: no data (${completed}/${usernames.length})`);
        }
      } catch (err) {
        console.error(`[gitlab] Error fetching ${username}:`, err.message);
        results[username] = null;
        completed++;
      }
    }
  }

  const workers = [];
  for (let w = 0; w < Math.min(concurrency, usernames.length); w++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return results;
}

module.exports = { fetchGitlabData };
