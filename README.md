# CO2OPT Employee Portal

A fun, colorful internal portal for CO2OPT employees.

## MVP features

- Email + password login with allowlisted `@co2opt.com` users
- First-time account activation using invite tokens
- Holiday tracker with manager/admin approvals
- Team availability calendar
- Everyone can see everyone else's leave allocation, used days, pending days and remaining balance
- Leave deduction excludes weekends and configured public holidays
- Half-day leave is **not** supported
- Movie / series / book recommendations
- Shared music recommendations
- Kudos and appreciation wall
- Weekly polls
- Decision wheel presets
- Birthdays and work anniversaries

## Tech

- Frontend: React + TypeScript + Vite
- Backend: Node.js + Express + TypeScript
- Database: SQLite + Prisma

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

Update the values, especially:

- `SESSION_SECRET`
- `EMPLOYEE_INVITES`

Example:

```env
EMPLOYEE_INVITES='[
  {"email":"admin@co2opt.com","name":"Admin","role":"ADMIN","inviteToken":"some-long-random-token-123456789"},
  {"email":"manager@co2opt.com","name":"Manager","role":"MANAGER","inviteToken":"another-long-random-token-123456789"},
  {"email":"employee@co2opt.com","name":"Employee","role":"EMPLOYEE","inviteToken":"third-long-random-token-123456789"}
]'
```

### 3) Create the database schema

```bash
npm run db:push
```

### 4) Seed allowlisted users and default public holidays

```bash
npm run seed
```

### 5) Start the frontend and backend together

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

## Activation flow

1. Seed users using `EMPLOYEE_INVITES`
2. Give each employee their invite token privately
3. Employee opens the app and chooses **Activate account**
4. Employee enters email, password, invite token, optional birthday and joined date
5. After activation, they can log in normally

## Leave rules implemented

- Annual allocation: `23`
- Full day only
- Weekends do not deduct
- Configured public holidays do not deduct
- Everyone can view everyone else's leave counts
- Employees cannot approve their own leave
- Overlapping pending/approved leave requests are blocked

## Branding

The uploaded CO2OPT logo is included at:

```text
apps/web/public/co2opt-logo.jpg
```

## Optional demo data (local machine only)

After creating the database, use `ALLOW_DEMO_SEED=yes npm run seed:demo` to populate four **fictional** accounts, recommendations, kudos, a poll and a wheel. The demo password is `DemoOnly!2026` (never use it outside throwaway development). Do not seed demo users against real company data.

## Important pre-deployment work

This is an MVP prototype, not production-ready. Replace the development in-memory session store with a persistent session store; add CSRF protection, login rate limiting, secure cookies over HTTPS, integration tests, atomic leave approval transactions, employee-specific accrual/adjustments if needed, and a full accessibility review. Set the actual company's public holidays as admin—none are assumed by default. Hosting has intentionally not been decided.

## Notes

This project was generated in a restricted environment. If dependency installation fails in that environment, run the setup locally on your machine where npm registry access is available.