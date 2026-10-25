# Source layout

## API (`apps/api/src`)

- `index.ts`: connects and synchronizes the database, then starts the server.
- `app.ts`: composes Express middleware, health checks, feature routers, and error handling. Importing the app does not start a listener or synchronize the database.
- `config/`: environment settings, allowed web origins, employee allowlist, and session secret.
- `features/auth/`: account routes, session types, current-user lookup, and authentication middleware.
- `features/users/`: directory and profile routes.
- `features/leave/`: leave requests, balances, and CSV reports.
- `features/calendar/`: team availability routes.
- `features/recommendations/`: recommendation routes, artwork search, reactions, ratings, and validation schema.
- `features/team/`: kudos and celebration routes.
- `middleware/`: shared HTTP error handling.
- `utils/`: date calculations and CSV escaping.
- `database/connection.ts`: shared Sequelize connection.
- `models/`: one file per table (`user`, `leave-request`, `recommendation`, `like`, `rating`, and `kudos`).
- `models/associations.ts`: relationships between initialized models.
- `models/index.ts`: public exports and association initialization; consumers import from `models` to load the complete model registry.

Feature routers retain the existing public URLs. Add feature-specific endpoints in their router and mount new routers in `app.ts`.

## Web (`apps/web/src`)

- `main.tsx`: React entry point and global stylesheet import.
- `App.tsx`: authenticated shell, navigation, and feature page composition.
- `features/dashboard/`: home page, dashboard types, shared portal state and actions (`usePortal`), and statistics display.
- `features/auth/`: login and signup screen.
- `features/leave/`: holidays page, leave forms, balances, records, calendar, and leave-day totals.
- `features/recommendations/`: discover page, recommendation form, modal, and grid.
- `features/team/`: team page, kudos form, celebrations, and directory.
- `features/profile/`: profile page and form.
- `api.ts`: shared HTTP client, downloads, and session-expiry notification.
- `types.ts`: API response types shared by features.
- `celebrations.ts`: celebration date calculations.
- `styles.css`: shared visual styles.

Pages receive the state and callbacks they use; forms and interactive components keep local UI state. Shared authenticated data loading and refresh behavior live in `usePortal`.

## Validation

```sh
npx tsc --noEmit -p apps/api/tsconfig.json
npm run build
node --import tsx --test apps/api/src/employee-emails.test.ts
```
