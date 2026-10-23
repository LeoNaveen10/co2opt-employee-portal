# CO2OPT Employee Portal

A fun, colorful internal portal for CO2OPT employees.

## MVP features

- Email + password login with allowlisted `@co2opt.com` users
- First-time account activation using invite tokens
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

Run this again after Prisma schema changes so the database and generated client stay in sync.

### 4) Seed allowlisted users

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

## Optional demo data (local machine only)

After creating the database, use `ALLOW_DEMO_SEED=yes npm run seed:demo` to populate four **fictional** accounts, recommendations and kudos. The demo password is `DemoOnly!2026` (never use it outside throwaway development). Do not seed demo users against real company data.

## Important pre-deployment work

This is an MVP prototype, not production-ready. Replace the development in-memory session store with a persistent session store; add CSRF protection, login rate limiting, secure cookies over HTTPS, integration tests, atomic leave booking transactions, employee-specific accrual/adjustments if needed, and a full accessibility review. Hosting has intentionally not been decided.

## Notes

This project was generated in a restricted environment. If dependency installation fails in that environment, run the setup locally on your machine where npm registry access is available.