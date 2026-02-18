/**
 * Orchestration logic for board discovery and sprint refresh.
 *
 * All I/O is injected via dependencies — this module never touches
 * the filesystem or network directly.
 */

const { processSprintReport } = require('./sprint-report');

/**
 * Determine if a board is stale (no sprints in last 6 months)
 */
function determineStaleness(sprints) {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const latestSprint = sprints
    .filter(s => s.endDate || s.completeDate)
    .sort((a, b) => new Date(b.endDate || b.completeDate) - new Date(a.endDate || a.completeDate))[0];

  if (!latestSprint) {
    return { stale: true, lastSprintEndDate: null };
  }

  const lastDate = new Date(latestSprint.endDate || latestSprint.completeDate);
  return {
    stale: lastDate < sixMonthsAgo,
    lastSprintEndDate: latestSprint.endDate || latestSprint.completeDate
  };
}

/**
 * Discover boards from Jira, determine staleness, and merge with existing team config.
 */
async function discoverBoards({ fetchBoards, fetchSprints, readStorage, writeStorage }) {
  console.log('Discovering boards for project RHOAIENG');

  const boards = await fetchBoards();
  console.log(`Found ${boards.length} scrum boards`);

  writeStorage('boards.json', {
    lastUpdated: new Date().toISOString(),
    boards: boards
  });

  // Fetch sprints for each board to determine staleness
  const DISCOVER_CONCURRENCY = 3;
  const boardStaleness = new Map();

  for (let i = 0; i < boards.length; i += DISCOVER_CONCURRENCY) {
    const chunk = boards.slice(i, i + DISCOVER_CONCURRENCY);
    const results = await Promise.all(chunk.map(async (board) => {
      try {
        const sprints = await fetchSprints(board.id);
        return { boardId: board.id, ...determineStaleness(sprints) };
      } catch (error) {
        console.warn(`Failed to fetch sprints for board ${board.id}:`, error.message);
        return { boardId: board.id, stale: false, lastSprintEndDate: null };
      }
    }));
    results.forEach(r => boardStaleness.set(r.boardId, r));
  }

  const staleCount = [...boardStaleness.values()].filter(s => s.stale).length;
  console.log(`Staleness check: ${staleCount} of ${boards.length} boards are stale`);

  // Merge with existing teams config
  const existingTeams = readStorage('teams.json');
  const existingMap = existingTeams?.teams
    ? new Map(existingTeams.teams.map(t => [t.boardId, t]))
    : new Map();

  const mergedTeams = boards.map(b => {
    const staleness = boardStaleness.get(b.id) || { stale: false, lastSprintEndDate: null };
    const existing = existingMap.get(b.id);

    if (existing) {
      const updated = {
        ...existing,
        boardName: b.name,
        stale: staleness.stale,
        lastSprintEndDate: staleness.lastSprintEndDate
      };
      if (staleness.stale && !existing.manuallyConfigured) {
        updated.enabled = false;
      }
      return updated;
    }

    return {
      boardId: b.id,
      boardName: b.name,
      displayName: b.name.replace(/^RHOAIENG\s*[-–]\s*/, ''),
      enabled: !staleness.stale,
      stale: staleness.stale,
      lastSprintEndDate: staleness.lastSprintEndDate,
      manuallyConfigured: false
    };
  });

  writeStorage('teams.json', { teams: mergedTeams });

  return { success: true, boardCount: boards.length, staleCount };
}

/**
 * Process a single board: fetch sprints, fetch sprint reports, transform, cache.
 */
async function processBoard({ board, hardRefresh, fetchSprints, fetchSprintReport, readStorage, writeStorage, jiraHost }) {
  console.log(`Processing board: ${board.name} (${board.id})`);

  const sprints = await fetchSprints(board.id);
  console.log(`  [${board.name}] Found ${sprints.length} sprints`);

  // Get closed sprints from last 12 months + active sprints
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const activeSprints = sprints.filter(s => s.state === 'active');
  const closedSprints = sprints
    .filter(s => s.state === 'closed')
    .filter(s => {
      const endDate = new Date(s.endDate || s.completeDate || 0);
      return endDate >= twelveMonthsAgo;
    })
    .sort((a, b) => new Date(b.completeDate || 0) - new Date(a.completeDate || 0));

  const sprintsToProcess = [...activeSprints, ...closedSprints];
  const sprintResults = [];

  for (const sprint of sprintsToProcess) {
    // Closed-sprint caching: skip if cached and not hard refresh
    if (!hardRefresh && sprint.state === 'closed') {
      const cached = readStorage(`sprints/${sprint.id}.json`);
      if (cached) {
        console.log(`  [${board.name}] Using cached: ${sprint.name}`);
        sprintResults.push(cached);
        continue;
      }
    }

    console.log(`  [${board.name}] Fetching sprint report: ${sprint.name} (${sprint.state})`);

    try {
      const rawReport = await fetchSprintReport(board.id, sprint.id);
      const processed = processSprintReport(rawReport, board.id, jiraHost);

      writeStorage(`sprints/${sprint.id}.json`, processed);
      sprintResults.push(processed);

      const m = processed.metrics;
      console.log(`    ${processed.committed.issues.length} committed, ${processed.delivered.issues.length} delivered, ${m.velocityPoints} pts velocity, ${m.commitmentReliabilityPoints}% reliability`);
    } catch (error) {
      console.error(`    Failed to process sprint ${sprint.name}:`, error.message);
    }
  }

  // Write sprint index for this board
  writeStorage(`sprints/board-${board.id}.json`, {
    boardId: board.id,
    boardName: board.name,
    lastUpdated: new Date().toISOString(),
    sprints: sprintsToProcess.map(s => ({
      id: s.id,
      name: s.name,
      state: s.state,
      startDate: s.startDate,
      endDate: s.endDate,
      completeDate: s.completeDate
    }))
  });

  // Pick active or most recent closed for dashboard
  const dashboardSprint = activeSprints[0] || closedSprints[0] || null;
  const dashboardResult = dashboardSprint
    ? sprintResults.find(r => r.sprint.id === dashboardSprint.id)
    : null;

  return {
    board,
    sprintResults,
    dashboardSprint,
    dashboardResult
  };
}

/**
 * Full refresh: process all enabled boards and generate dashboard summary.
 */
async function performRefresh({ hardRefresh, fetchBoards, fetchSprints, fetchSprintReport, readStorage, writeStorage, jiraHost }) {
  console.log(`Starting refresh (hardRefresh: ${hardRefresh})`);
  const refreshStart = Date.now();

  // Get enabled boards
  const teamsData = readStorage('teams.json');
  const enabledTeams = teamsData?.teams?.filter(t => t.enabled !== false) || [];

  if (enabledTeams.length === 0) {
    console.log('No enabled boards to refresh');
    return { success: true, boardCount: 0, sprintCount: 0 };
  }

  // Also update boards list
  const boardsData = readStorage('boards.json');
  const allBoards = boardsData?.boards || [];

  // Process boards with concurrency limit of 2
  const CONCURRENCY = 2;
  const boardResults = [];

  for (let i = 0; i < enabledTeams.length; i += CONCURRENCY) {
    const chunk = enabledTeams.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(chunk.map(team =>
      processBoard({
        board: { id: team.boardId, name: team.boardName || team.displayName },
        hardRefresh,
        fetchSprints,
        fetchSprintReport,
        readStorage,
        writeStorage,
        jiraHost
      })
    ));
    boardResults.push(...chunkResults);
  }

  // Generate dashboard summary
  const dashboardSummary = {
    lastUpdated: new Date().toISOString(),
    boards: {}
  };

  for (const { board, dashboardSprint, dashboardResult } of boardResults) {
    if (dashboardSprint && dashboardResult) {
      dashboardSummary.boards[board.id] = {
        boardName: board.name,
        sprint: {
          id: dashboardSprint.id,
          name: dashboardSprint.name,
          state: dashboardSprint.state,
          startDate: dashboardSprint.startDate,
          endDate: dashboardSprint.endDate
        },
        metrics: dashboardResult.metrics
      };
    }
  }

  writeStorage('dashboard-summary.json', dashboardSummary);

  const totalSprints = boardResults.reduce((sum, r) => sum + r.sprintResults.length, 0);
  const elapsed = ((Date.now() - refreshStart) / 1000).toFixed(1);
  console.log(`Refresh complete: ${boardResults.length} boards, ${totalSprints} sprints (${elapsed}s)`);

  return {
    success: true,
    boardCount: boardResults.length,
    sprintCount: totalSprints
  };
}

module.exports = { discoverBoards, processBoard, performRefresh, determineStaleness };
