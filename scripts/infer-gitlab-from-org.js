#!/usr/bin/env node

/**
 * Infer missing GitLab usernames by matching people against
 * a GitLab group's member list. Updates data/org-roster-full.json in place.
 *
 * Usage:
 *   node scripts/infer-gitlab-from-org.js <group-path>
 *
 * Example:
 *   node scripts/infer-gitlab-from-org.js redhat/rhoai
 *
 * Requires GITLAB_TOKEN env var (personal access token with read_api scope).
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const ROSTER_PATH = path.join(__dirname, '..', 'data', 'org-roster-full.json');
const GITLAB_BASE_URL = process.env.GITLAB_BASE_URL || 'https://gitlab.com';
const GITLAB_TOKEN = process.env.GITLAB_TOKEN || null;

const groupPath = process.argv[2];
if (!groupPath) {
  console.error('Usage: node scripts/infer-gitlab-from-org.js <group-path>');
  process.exit(1);
}

if (!GITLAB_TOKEN) {
  console.warn('WARNING: GITLAB_TOKEN not set. Private group members may not be visible.');
}

function buildHeaders() {
  const headers = { Accept: 'application/json' };
  if (GITLAB_TOKEN) headers['PRIVATE-TOKEN'] = GITLAB_TOKEN;
  return headers;
}

async function fetchGroupMembers(group) {
  console.log(`Fetching ${group} group members...`);
  const members = [];
  let page = 1;

  while (true) {
    const url = `${GITLAB_BASE_URL}/api/v4/groups/${encodeURIComponent(group)}/members/all?per_page=100&page=${page}`;
    const res = await fetch(url, { headers: buildHeaders() });

    if (!res.ok) {
      console.error(`Failed to fetch group members: HTTP ${res.status}`);
      if (res.status === 404) {
        console.error(`Group '${group}' not found or not accessible.`);
      }
      process.exit(1);
    }

    const data = await res.json();
    if (data.length === 0) break;
    members.push(...data);

    const totalPages = parseInt(res.headers.get('x-total-pages') || '1', 10);
    if (page >= totalPages) break;
    page++;
  }

  console.log(`  Found ${members.length} group members`);
  return members;
}

function normalizeForMatch(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

function tryMatch(person, groupMembers) {
  const normalizedName = normalizeForMatch(person.name);
  const emailPrefix = person.email ? person.email.split('@')[0].toLowerCase() : '';
  const [firstName, ...lastParts] = person.name.split(' ');
  const lastName = lastParts[lastParts.length - 1] || '';

  for (const member of groupMembers) {
    const username = member.username;

    // Match by GitLab profile name
    if (member.name && normalizeForMatch(member.name) === normalizedName) {
      return username;
    }

    // Match by login resembling email prefix / uid
    if (emailPrefix && username.toLowerCase() === emailPrefix) {
      return username;
    }

    // Match by login containing first+last name patterns
    const loginLower = username.toLowerCase();
    const firstLower = firstName.toLowerCase();
    const lastLower = lastName.toLowerCase();
    if (lastLower.length > 2 && firstLower.length > 0) {
      if (loginLower === `${firstLower}${lastLower}` ||
          loginLower === `${firstLower}-${lastLower}` ||
          loginLower === `${firstLower}.${lastLower}` ||
          loginLower === `${firstLower[0]}${lastLower}`) {
        return username;
      }
    }
  }

  return null;
}

async function main() {
  const data = JSON.parse(fs.readFileSync(ROSTER_PATH, 'utf8'));
  const groupMembers = await fetchGroupMembers(groupPath);

  // Collect all people missing GitLab usernames
  const needsInference = [];
  for (const org of Object.values(data.orgs)) {
    for (const m of org.members) {
      if (!m.gitlabUsername) needsInference.push(m);
    }
    if (!org.leader.gitlabUsername) needsInference.push(org.leader);
  }

  console.log(`\nAttempting to match ${needsInference.length} people against ${groupPath}...\n`);

  let inferredCount = 0;
  for (const person of needsInference) {
    const match = tryMatch(person, groupMembers);
    if (match) {
      person.gitlabUsername = match;
      person.gitlabInferred = true;
      inferredCount++;
      console.log(`  MATCH: ${person.name} -> ${match}`);
    }
  }

  console.log(`\nInferred ${inferredCount} GitLab usernames from ${groupPath}`);

  if (inferredCount > 0) {
    data.generatedAt = new Date().toISOString();
    fs.writeFileSync(ROSTER_PATH, JSON.stringify(data, null, 2));
    console.log(`Updated ${ROSTER_PATH}`);
  }

  // Report remaining
  const stillMissing = [];
  for (const org of Object.values(data.orgs)) {
    for (const m of org.members) {
      if (!m.gitlabUsername) stillMissing.push(m);
    }
  }
  console.log(`Still missing GitLab usernames: ${stillMissing.length}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
