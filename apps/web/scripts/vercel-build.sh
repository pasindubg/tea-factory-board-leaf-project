#!/bin/sh
# Vercel's build entry point.
#
# This lives in a file rather than inline in apps/web/vercel.json because
# Vercel caps `buildCommand` at 256 characters, and the inline version grew
# past it once it captured migration output. A script also means the logic is
# reviewable and testable like any other code.
#
# It sits beside vercel.json, NOT at the repo root: Vercel's Root Directory for
# this project is apps/web, so the build's working directory is apps/web and a
# root-level path resolves to nothing (exit 127). The pnpm commands below are
# workspace-wide and work from here regardless.
#
# Migrations run here, inside Preview and Production builds: a failed
# migration then fails the build and Vercel never activates the deploy. See
# the header of .github/workflows/release.yml for why that beat running them
# in a separate CI job.
set -e

node scripts/verify-deployment-env.mjs

if [ "$VERCEL_ENV" = "production" ] || [ "$VERCEL_ENV" = "preview" ]; then
  # Use only the validated environment-specific Neon connection. The legacy
  # shared DATABASE_URL must never choose the migration destination.
  DATABASE_URL=$(node scripts/verify-deployment-env.mjs --migration-url)
  export DATABASE_URL
  echo "$VERCEL_ENV build — applying pending Drizzle migrations."

  # Straight through to the build log, no capture and no filtering. Earlier
  # revisions of this file buffered the output to /tmp and stripped spinner
  # frames back out of it, because `drizzle-kit migrate` printed a spinner and
  # nothing else — including on failure, where it exited 1 having written no
  # error at all. db:migrate now runs packages/db/src/migrate.ts, which prints
  # plain lines and the actual Postgres error, so none of that is needed.
  set +e
  pnpm --filter @tea/db db:migrate 2>&1
  MIGRATE_STATUS=$?
  set -e

  if [ "$MIGRATE_STATUS" -ne 0 ]; then
    echo "Migration failed (exit $MIGRATE_STATUS) — see the lines above."
    exit "$MIGRATE_STATUS"
  fi
  echo "Migrations applied."
fi

# Branch-specific NEXT_PUBLIC values must never come from another branch's cache.
pnpm exec turbo run build --filter=web --env-mode=loose --force
