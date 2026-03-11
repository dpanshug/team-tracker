# Contributing to Team Tracker

Thanks for your interest in contributing! This guide will get you up and running.

## Prerequisites

- **Node.js 20+** and npm
- A **Red Hat Jira PAT** (Personal Access Token) for live data — [create one here](https://issues.redhat.com/secure/ViewProfile.jspa?selectedTab=com.atlassian.pats.pats-plugin:jira-user-personal-access-tokens)
- Or just use **Demo Mode** (no credentials needed — see below)

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/accorvin/team-tracker.git
cd team-tracker
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

**Option A — Demo Mode (no credentials needed):**
```env
DEMO_MODE=true
VITE_DEMO_MODE=true
```

**Option B — Live data:**
```env
JIRA_TOKEN=your-personal-access-token
JIRA_HOST=https://issues.redhat.com
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
```

Ask the maintainer for Firebase config values if you need live auth.

### 3. Run locally

```bash
npm run dev:full
```

This starts both the Vite frontend (port 5173) and the Express dev server (port 3001) concurrently. The Vite dev server proxies `/api` requests to the backend.

- **Frontend:** http://localhost:5173
- **API:** http://localhost:3001/api

### 4. Run tests

```bash
npm test            # single run
npm run test:watch  # watch mode
npm run lint        # linting
```

## Project Structure

```
├── src/                        # Vue 3 frontend
│   ├── components/             # Vue components (Dashboard, Views, Charts, etc.)
│   ├── composables/            # Composition API hooks (useAuth, useRoster, etc.)
│   ├── services/               # API client
│   ├── utils/                  # Utility functions
│   └── __tests__/              # Frontend tests (Vitest + jsdom)
├── server/                     # Local dev server
│   ├── dev-server.js           # Express app (mirrors Lambda API)
│   ├── storage.js              # Local file storage (replaces S3 in dev)
│   ├── demo-storage.js         # Demo mode fixture storage
│   ├── jira/                   # Jira API integration logic
│   │   └── __tests__/          # Server-side tests
│   └── github/                 # GitHub API integration logic
├── amplify/                    # AWS Amplify backend
│   └── backend/function/       # Lambda functions
├── fixtures/                   # Demo mode fixture data
├── scripts/                    # Utility scripts
├── amplify.yml                 # Amplify build config
├── index.html                  # Entry point
└── vite.config.mjs             # Vite config
```

### Key Architecture Notes

- **Auth:** Firebase Google sign-in, restricted to `@redhat.com` domain. `AuthGuard` component handles login flow.
- **Storage:** S3 in production, local JSON files in development (`server/storage.js`).
- **Demo Mode:** Set `DEMO_MODE=true` to use fixture data from `fixtures/` — no Jira token or Firebase needed. Great for frontend development.
- **Charts:** Vue Chart.js (Chart.js 4) for data visualizations.

## Making Changes

### Branch naming

Use descriptive branch names:
- `feat/description` — new features
- `fix/description` — bug fixes
- `refactor/description` — code improvements

### Development workflow

1. Create a branch from `main`
2. Make your changes
3. Write or update tests for any changed logic
4. Run `npm test` and `npm run lint` to verify
5. Run `npm run build` to confirm the production build works
6. Open a PR against `main`

### Pull requests

- PRs require at least one approving review before merge
- CI must pass (lint + tests + build)
- Keep PRs focused — one feature or fix per PR
- Include a clear description of what changed and why

### Writing tests

Tests use **Vitest** with **jsdom** and **@vue/test-utils**.

- Frontend tests: `src/__tests__/`
- Server tests: `server/__tests__/` and `server/jira/__tests__/`

```bash
# Run a specific test file
npx vitest run server/jira/__tests__/sprint-report.test.js

# Run in watch mode
npm run test:watch
```

### Code style

- Vue 3 Composition API (no Options API)
- Tailwind CSS for styling
- ESLint config in `eslint.config.mjs`
- Keep components focused and composable
- Extract reusable logic into composables (`src/composables/`)

## Deployment

Production deploys happen automatically when changes merge to `main` via AWS Amplify. You don't need AWS access to contribute — just get your PR reviewed and merged.

## Questions?

Open an issue or reach out to @accorvin.
