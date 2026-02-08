# VentureOS Database Migrations

This directory contains SQL migrations for the VentureOS Postgres schema.

## Apply (psql)
From the repo root:

```bash
export DATABASE_URL="postgres://user:pass@localhost:5432/ventureos"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/001_core.sql
```

## Rollback (psql)
There is no down migration yet. To rollback `001_core.sql`, drop the tables in reverse order or drop the schema/database.

```bash
# Example (destructive):
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
```

## Migration Tool (placeholder)
When a migration tool is adopted (e.g., `golang-migrate`, `sqitch`, `atlas`, `flyway`),
add tool-specific commands here and create matching `*_down.sql` files.
