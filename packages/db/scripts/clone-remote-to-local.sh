#!/usr/bin/env bash
# Clones the hosted Supabase project's data (public + auth schemas) into the
# local Supabase CLI stack. Run this deliberately, whenever you want a fresh
# local copy of real data — it is never invoked automatically by any script,
# CI job, or migration.
#
# Requires: Docker (used to run pg_dump/psql without needing them installed
# locally), and the local stack already running (`supabase start`) with
# migrations already applied (`pnpm db:migrate` against the local DB).
#
# Usage (from repo root, with the HOSTED .env sourced so DATABASE_URL points
# at the hosted session pooler):
#   set -a; . ./.env; set +a
#   packages/db/scripts/clone-remote-to-local.sh
set -euo pipefail

PG_IMAGE="postgres:17"
# host.docker.internal, not 127.0.0.1: these commands run *inside* a container
# via `docker run`, so 127.0.0.1 would mean the container's own loopback, not
# the host machine running the local Supabase stack. Docker Desktop maps
# host.docker.internal to the host automatically.
LOCAL_DB_URL="postgresql://postgres:postgres@host.docker.internal:54322/postgres"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set. Source the HOSTED .env first (set -a; . ./.env; set +a)." >&2
  exit 1
fi

if [[ "$DATABASE_URL" == *"127.0.0.1"* || "$DATABASE_URL" == *"localhost"* ]]; then
  echo "DATABASE_URL looks local ($DATABASE_URL) — this script clones FROM the hosted project TO local, refusing to run backwards." >&2
  exit 1
fi

if ! docker run --rm "$PG_IMAGE" pg_isready -d "$LOCAL_DB_URL" >/dev/null 2>&1; then
  echo "Local Supabase stack isn't reachable at $LOCAL_DB_URL. Run 'supabase start' and 'pnpm db:migrate' first." >&2
  exit 1
fi

echo "Cloning hosted -> local ($LOCAL_DB_URL). This copies real data, including auth.users, to your machine."
read -r -p "Type 'yes' to continue: " confirm
if [[ "$confirm" != "yes" ]]; then
  echo "Aborted."
  exit 1
fi

echo "Truncating local public + auth data (schema itself is untouched)..."
docker run --rm -i "$PG_IMAGE" psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare r record;
begin
  for r in
    select schemaname, tablename from pg_tables
    where schemaname in ('public', 'auth')
      and not (schemaname = 'auth' and tablename = 'schema_migrations')
  loop
    execute format('truncate table %I.%I cascade', r.schemaname, r.tablename);
  end loop;
end $$;
SQL

echo "Dumping hosted public + auth (data only, excluding auth.schema_migrations)..."
# No --disable-triggers: it emits ALTER TABLE ... DISABLE TRIGGER per table,
# which requires table OWNERSHIP — the local stack's auth.* tables are owned
# by supabase_auth_admin, not the postgres role we connect as. Instead we
# bypass FK/trigger checks for the whole restore session below via
# session_replication_role, which only needs elevated session privilege, not
# per-table ownership.
docker run --rm "$PG_IMAGE" pg_dump "$DATABASE_URL" \
  --data-only \
  --schema=public \
  --schema=auth \
  --exclude-table=auth.schema_migrations \
  --no-owner --no-privileges \
  > /tmp/tea-factory-remote-data.sql

echo "Restoring into local stack..."
{
  echo "SET session_replication_role = replica;"
  cat /tmp/tea-factory-remote-data.sql
} | docker run --rm -i "$PG_IMAGE" psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1

rm -f /tmp/tea-factory-remote-data.sql
echo "Done. Local stack now mirrors hosted data as of $(date)."
