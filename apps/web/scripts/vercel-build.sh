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
# Migrations run here, inside the production build, on purpose: a failed
# migration then fails the build and Vercel never activates the deploy. See
# the header of .github/workflows/release.yml for why that beat running them
# in a separate CI job.
set -e

if [ "$VERCEL_ENV" = "production" ]; then
  # Host only — the parameter expansion strips everything through "@", so the
  # password never reaches the log.
  echo "Production build — applying pending Drizzle migrations against ${DATABASE_URL##*@}"

  # drizzle-kit renders a spinner that overwrites its own error, so the output
  # is captured and replayed with the spinner frames filtered out. Kept off a
  # pipeline on purpose: `cmd | grep` would report grep's exit status and let a
  # failed migration deploy.
  set +e
  pnpm --filter @tea/db db:migrate > /tmp/migrate.log 2>&1
  MIGRATE_STATUS=$?
  set -e

  grep -v 'applying migrations' /tmp/migrate.log | tail -60

  if [ "$MIGRATE_STATUS" -ne 0 ]; then
    echo "Migration failed (exit $MIGRATE_STATUS) — see the lines above."
    exit "$MIGRATE_STATUS"
  fi
  echo "Migrations applied."
fi

pnpm exec turbo run build --filter=web
