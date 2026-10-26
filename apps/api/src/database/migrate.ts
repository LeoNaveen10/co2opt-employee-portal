import { sequelize } from '../database/connection';
// Additive, versioned migration. Intentionally does not call sync/alter or touch legacy tables.
const sql = `
CREATE TABLE IF NOT EXISTS portal_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS jira_connections (
  id varchar(255) PRIMARY KEY, "userId" varchar(255) NOT NULL REFERENCES users(id),
  "cloudId" varchar(255) NOT NULL, "siteUrl" varchar(255) NOT NULL, "accountId" varchar(255) NOT NULL,
  "displayName" varchar(255) NOT NULL, credentials text, "expiresAt" timestamptz NOT NULL, status varchar(255) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("userId", "cloudId"), UNIQUE ("cloudId", "accountId")
);
CREATE TABLE IF NOT EXISTS time_entries (
  id varchar(255) PRIMARY KEY, "userId" varchar(255) NOT NULL REFERENCES users(id),
  "connectionId" varchar(255) NOT NULL REFERENCES jira_connections(id), "cloudId" varchar(255) NOT NULL,
  "issueId" varchar(255) NOT NULL, "ticketKey" varchar(255) NOT NULL, summary text NOT NULL,
  "worklogId" varchar(255) NOT NULL, "authorAccountId" varchar(255) NOT NULL, confirmed jsonb NOT NULL, desired jsonb,
  state varchar(255) NOT NULL DEFAULT 'pending', version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  deleted boolean NOT NULL DEFAULT false, error text,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("cloudId", "worklogId")
);
CREATE INDEX IF NOT EXISTS time_entries_owner ON time_entries ("userId", "connectionId");
CREATE TABLE IF NOT EXISTS time_sync_operations (
  id varchar(255) PRIMARY KEY, "userId" varchar(255) NOT NULL REFERENCES users(id),
  "entryId" varchar(255) REFERENCES time_entries(id), "connectionId" varchar(255) NOT NULL REFERENCES jira_connections(id), action varchar(255) NOT NULL CHECK (action IN ('create','update','delete')),
  payload jsonb, "expectedVersion" integer NOT NULL, status varchar(255) NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0, "reconcileRequired" boolean NOT NULL DEFAULT false, "nextAttempt" timestamptz NOT NULL DEFAULT now(), error text,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
-- Upgrade preliminary tables created by the old development auto-sync without dropping data.
ALTER TABLE time_sync_operations ADD COLUMN IF NOT EXISTS "connectionId" varchar(255) REFERENCES jira_connections(id);
ALTER TABLE time_sync_operations ADD COLUMN IF NOT EXISTS "reconcileRequired" boolean NOT NULL DEFAULT false;
UPDATE time_sync_operations op SET "connectionId" = entry."connectionId" FROM time_entries entry WHERE op."entryId" = entry.id AND op."connectionId" IS NULL;
ALTER TABLE time_sync_operations ALTER COLUMN "connectionId" SET NOT NULL;
ALTER TABLE time_sync_operations ALTER COLUMN "entryId" DROP NOT NULL;
ALTER TABLE time_entries ALTER COLUMN "worklogId" SET NOT NULL;
ALTER TABLE time_entries ALTER COLUMN confirmed SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS jira_account_owner ON jira_connections ("cloudId", "accountId");
CREATE INDEX IF NOT EXISTS time_sync_due ON time_sync_operations (status, "nextAttempt");
CREATE UNIQUE INDEX IF NOT EXISTS time_sync_one_active ON time_sync_operations ("entryId") WHERE status IN ('pending','processing','paused','reconcile','failed');
`;
try {
  await sequelize.transaction(async transaction => {
    await sequelize.query('SELECT pg_advisory_xact_lock(724220)', { transaction });
    await sequelize.query('CREATE TABLE IF NOT EXISTS portal_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())', { transaction });
    const [rows] = await sequelize.query("SELECT name FROM portal_migrations WHERE name = '001-jira-time-tracking'", { transaction });
    if (!rows.length) {
      await sequelize.query(sql, { transaction });
      await sequelize.query("INSERT INTO portal_migrations(name) VALUES ('001-jira-time-tracking')", { transaction });
    }
  });
  console.log('Jira time tracking migration applied.');
} finally { await sequelize.close(); }
