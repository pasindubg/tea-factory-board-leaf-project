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

  # Streamed, not redirected to a file. Buffering the whole run into
  # /tmp/migrate.log meant nothing at all was printed until the command
  # returned — so a migration that blocked on a lock produced a build log that
  # stopped dead after the line above, with no way to tell a hang from a crash.
  #
  # The exit status travels through a file because the pipeline runs the
  # command in a subshell, and POSIX sh has no PIPESTATUS to read it back with.
  #
  # The filter: drizzle-kit's spinner emits carriage returns without newlines
  # and appends its failure to the last frame, so the text is split on \r and
  # the spinner phrase is stripped *off* the line rather than the line being
  # dropped — dropping it deleted the error along with it.
  rm -f /tmp/migrate.status
  set +e
  {
    pnpm --filter @tea/db db:migrate 2>&1
    echo $? > /tmp/migrate.status
  } | tr '\r' '\n' \
    | sed 's/.*applying migrations\.*//' \
    | grep -v '^[[:space:]]*$'
  set -e

  MIGRATE_STATUS=$(cat /tmp/migrate.status 2>/dev/null || echo 1)

  if [ "$MIGRATE_STATUS" -ne 0 ]; then
    echo "Migration failed (exit $MIGRATE_STATUS) — see the lines above."
    exit "$MIGRATE_STATUS"
  fi
  echo "Migrations applied."
fi

pnpm exec turbo run build --filter=web
