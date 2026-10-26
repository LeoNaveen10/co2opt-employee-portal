# CO2OPT Employee Portal

A fun, colorful internal portal for CO2OPT employees.

## MVP features

- Email + password login with allowlisted `@co2opt.com` users
- Direct sign-up for allowlisted emails with a name and password; no activation or password reset
- Leave tracker with immediate recording and balance deductions
- Team availability calendar
- Everyone can see everyone else's leave allocation, taken days and remaining balance
- Leave deduction excludes weekends
- Half-day leave is **not** supported
- Movie / series / book recommendations
- Apple Search artwork lookup for movies, series and music (no API key required); titles not in its catalog can use a direct HTTPS artwork URL
- Authors can edit or delete their own recommendations
- Leave records cannot be edited or deleted after they are added
- Shared music recommendations
- Kudos and appreciation wall
- Birthdays and work anniversaries
- Downloadable monthly or yearly team leave reports in CSV format
- Weekly Jira time tracking with locally stored history, individual entries, and holiday labels

## Tech

- Frontend: React + TypeScript + Vite
- Backend: Node.js + Express + TypeScript
- Database: PostgreSQL + Sequelize

## Project structure

```text
apps/
  api/
  web/
```

## Local setup

### 1) Install dependencies

From the repo root:

```bash
npm install
```

### 2) Configure the backend

Copy the example env file:

```bash
cp apps/api/.env.example apps/api/.env
```

Set `EMPLOYEE_EMAILS` to a JSON array. Only listed addresses from `co2opt.com` can sign up or log in. An empty list allows nobody. Invalid configuration stops the API at startup.

```env
EMPLOYEE_EMAILS='["alice@co2opt.com","bob@co2opt.com"]'
```

Employees enter their own job role at sign-up. Roles are display-only; all employees have the same access. No users or demo data are seeded. No session secret configuration is needed: the API generates one at startup. Restarting the API signs everyone out. Restart after editing the allowlist.

### 3) Configure PostgreSQL

Create a local PostgreSQL database named `employee-info`, then set `DATABASE_URL`
in `apps/api/.env`:

```env
DATABASE_URL="postgres://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/employee-info"
```

The API uses Sequelize models for all persistence. Schema synchronization creates
missing tables in PostgreSQL; it does not migrate existing SQLite data.

### 4) Create the database schema

```bash
npm run db:sync
npm run db:migrate
```

`db:sync` creates legacy tables. `db:migrate` applies the additive, versioned Jira/time tracking migration. Startup does not synchronize schemas.

### 5) Start the frontend and backend together

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

## Sign-up and login

For Jira setup and time tracking behavior, see [Time tracking setup](docs/time-tracking-setup.md).

First-time employees choose **Sign up**, enter their allowlisted email, name, job role and a password of at least 8 characters, plus optional birthday and joined date. Their account is created at that point and they are signed in immediately. Returning employees log in with their email and password. There are no invite tokens, activation steps or password reset flows. Existing passwords continue to work for allowlisted accounts.

## Leave rules implemented

- Annual allocation: `23`
- Full day only
- Weekends do not deduct
- Public holidays are not used in leave calculations
- Everyone can view everyone else's leave counts
- Leave is recorded and deducted immediately; there is no approval workflow
- Leave records are permanent once recorded
- Overlapping leave records are blocked

## Branding

The uploaded CO2OPT logo is included at:

```text
apps/web/public/co2opt-logo.jpg
```

## Important pre-deployment work

This is an MVP prototype, not production-ready. Replace the development in-memory session store with a persistent session store; add CSRF protection, login rate limiting, secure cookies over HTTPS, integration tests, atomic leave booking transactions, employee-specific accrual/adjustments if needed, and a full accessibility review. Hosting has intentionally not been decided.

## Notes

This project was generated in a restricted environment. If dependency installation fails in that environment, run the setup locally on your machine where npm registry access is available.
# Monitoring logs

The API emits newline-delimited JSON to stdout (debug/info/warn) and stderr
(error/fatal). Configure `LOG_LEVEL` (default `info`) and `APP_RELEASE` in the API
environment. Have your hosting platform or log collector ingest both streams and
set access controls and retention there; the application does not rotate local files.

Each HTTP completion records its matched route template, status, duration in ms,
and `requestId`. Unknown routes use `unmatched` to avoid logging arbitrary URLs.
The API returns `X-Request-ID`, exposes it through CORS, and accepts UUID v4 IDs
from the frontend. Error responses also include the ID. Search by `requestId` to
connect browser failures with server requests. Startup, process failures, and Jira
worker results use distinct event names. Request bodies, headers, query strings,
employee data, SQL, and raw error messages/stacks are intentionally excluded.

The frontend reports failed/slow API requests (slow means >= 3 seconds), uncaught
errors, unhandled rejections, and React render failures to `POST /monitoring/events`.
It sends only fixed event names, request IDs, status, and duration. It reports at
most 20 events per minute per page, never retries ingestion, and does not report
its own ingestion failures. Browser reporting is best effort and may be lost during
navigation or outages. React failures show a reload screen.

Ingestion accepts at most 8 KB and 300 events/minute per API process. Browser
events are explicitly tagged `source: untrusted-browser`; they are observations,
not audit evidence. Use edge rate limiting for public deployments; the process-wide
cap is not a distributed abuse control. No third-party monitoring account is wired
up by this change. Configure alerts in your collector for HTTP 5xx rates, request
duration, `server.start_failed`, `time_sync.worker.failed`, terminal
`time_sync.operation.failed` (`retry=false`), and `frontend.event` counts.

