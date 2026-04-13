#!/usr/bin/env node

/**
 * Enrich team-data GitHub IDs from Upstream Pulse team members.
 *
 * Matches by email: for each team-data person missing a GitHub ID,
 * finds a matching Upstream Pulse member and updates via the API.
 *
 * Usage:
 *   # Dry-run (default): shows what would be updated
 *   node scripts/enrich-github-from-upstream-pulse.js
 *
 *   # Apply changes
 *   node scripts/enrich-github-from-upstream-pulse.js --apply
 *
 * Cluster access (port-forward first):
 *   oc port-forward -n ambient-code--uie-org-pulse deployment/backend 3001:3001
 *   oc port-forward -n ambient-code--upstream-pulse deployment/backend 4321:3000
 *
 * Environment:
 *   TEAM_DATA_URL      - team-data backend (default: http://localhost:3001)
 *   UPSTREAM_PULSE_URL - upstream-pulse backend (default: http://localhost:4321)
 */

const fetch = require('node-fetch');

const TEAM_DATA_URL = (process.env.TEAM_DATA_URL || 'http://localhost:3001').replace(/\/+$/, '');
const UPSTREAM_PULSE_URL = (process.env.UPSTREAM_PULSE_URL || 'http://localhost:4321').replace(/\/+$/, '');
const APPLY = process.argv.includes('--apply');

async function main() {
  console.log('Upstream Pulse URL:', UPSTREAM_PULSE_URL);
  console.log('Team Data URL:     ', TEAM_DATA_URL);
  console.log('Mode:              ', APPLY ? 'APPLY (will write changes)' : 'DRY-RUN (pass --apply to write)');
  console.log('');

  // Fetch Upstream Pulse team members
  console.log('Fetching Upstream Pulse team members...');
  var upRes = await fetch(UPSTREAM_PULSE_URL + '/api/team-members');
  if (!upRes.ok) {
    console.error('Failed to fetch Upstream Pulse team members: HTTP ' + upRes.status);
    process.exit(1);
  }
  var upData = await upRes.json();
  var upMembers = upData.members || [];
  console.log('  ' + upMembers.length + ' members found');

  // Build email -> githubUsername map from Upstream Pulse
  var emailToGithub = {};
  var upWithGithub = 0;
  for (var i = 0; i < upMembers.length; i++) {
    var m = upMembers[i];
    if (m.githubUsername && m.primaryEmail) {
      emailToGithub[m.primaryEmail.toLowerCase()] = m.githubUsername;
      upWithGithub++;
    }
  }
  console.log('  ' + upWithGithub + ' have both email and GitHub username');
  console.log('');

  // Fetch team-data people
  console.log('Fetching team-data people...');
  var tdRes = await fetch(TEAM_DATA_URL + '/api/modules/team-data/people');
  if (!tdRes.ok) {
    console.error('Failed to fetch team-data people: HTTP ' + tdRes.status);
    process.exit(1);
  }
  var tdData = await tdRes.json();
  var tdPeople = tdData.people || [];
  console.log('  ' + tdPeople.length + ' people found');

  // Find matches
  var matches = [];
  var alreadyHas = 0;
  var noEmail = 0;
  var noMatch = 0;

  for (var j = 0; j < tdPeople.length; j++) {
    var person = tdPeople[j];

    if (person.github && person.github.username) {
      alreadyHas++;
      continue;
    }

    if (!person.email) {
      noEmail++;
      continue;
    }

    var ghUsername = emailToGithub[person.email.toLowerCase()];
    if (ghUsername) {
      matches.push({ uid: person.uid, name: person.name, email: person.email, githubUsername: ghUsername });
    } else {
      noMatch++;
    }
  }

  console.log('');
  console.log('Results:');
  console.log('  Already have GitHub ID: ' + alreadyHas);
  console.log('  No email in team-data:  ' + noEmail);
  console.log('  No match in UP:         ' + noMatch);
  console.log('  Matches found:          ' + matches.length);
  console.log('');

  if (matches.length === 0) {
    console.log('Nothing to update.');
    return;
  }

  // Show matches
  for (var k = 0; k < matches.length; k++) {
    var match = matches[k];
    console.log('  ' + match.name + ' (' + match.email + ') -> ' + match.githubUsername);
  }
  console.log('');

  if (!APPLY) {
    console.log('Dry-run complete. Run with --apply to update team-data.');
    return;
  }

  // Apply updates
  console.log('Applying ' + matches.length + ' updates...');
  var success = 0;
  var failed = 0;

  for (var n = 0; n < matches.length; n++) {
    var m = matches[n];
    try {
      var res = await fetch(TEAM_DATA_URL + '/api/modules/team-data/people/' + m.uid + '/github', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: m.githubUsername })
      });
      if (res.ok) {
        success++;
      } else {
        console.error('  Failed to update ' + m.uid + ': HTTP ' + res.status);
        failed++;
      }
    } catch (err) {
      console.error('  Error updating ' + m.uid + ': ' + err.message);
      failed++;
    }
  }

  console.log('');
  console.log('Done: ' + success + ' updated, ' + failed + ' failed');
}

main().catch(function(err) {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
