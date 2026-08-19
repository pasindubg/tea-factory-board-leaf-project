# Background-job engine — FROZEN ZONE

This directory (plus `lib/background-jobs.ts` and `lib/background-jobs-server.ts`)
is the generic background-processing engine. It was stabilised after a long
testing cycle (lease/heartbeat recovery, the no-self-HTTP first chunk, chunked
resumable cursors). **Do not modify it while fixing a feature** — a parsing or
import bug is never caused by, or fixed in, this layer.

## The boundary

| Engine (here — generic, frozen) | Domain (lives with its feature) |
|---|---|
| `worker.ts` claim/lease/chunk loop | job handlers (e.g. `app/dashboard/blm-cloud/auction-data/_actions/dispatch-import-job.ts`) |
| `registry.ts` handler contract + table | Excel parsing (`packages/api/src/auction/read-xlsx.ts`, `parse-dispatch-sheet.ts`) |
| `trigger.ts`, `auth.ts`, `actor.ts`, `context.ts` | queue actions (e.g. `.../_actions/import.ts`) |
| `launch.ts` façade | row-apply logic (`.../_actions/import-row.ts`) |

The engine never imports domain code except the handler registration lines in
`registry.ts`'s `JOB_HANDLERS` table. Domain code never imports engine
internals — only these three entry points:

1. **Types** from `@/lib/background-jobs` (`JobRunItem`, `JobKey`) and
   `@/lib/jobs/registry` (`JobHandler`) — to implement the contract.
2. **`startJobRun` / `jobIsRunning`** from `@/lib/background-jobs-server` — to queue.
3. **`runQueuedJobAfterResponse`** from `@/lib/jobs/launch` — to start the
   worker. Never call `claimAndRunChunk`/`baseUrlFromHeaders` from feature code.

## Adding a new background job

1. Add its key to `JOB_KEYS` and a `JobDefinition` in `lib/background-jobs.ts`.
2. Write the handler **in the feature's own directory**, typed as `JobHandler`.
   It must be resumable from its cursor — re-applying a unit must never happen.
3. Register it: one import + one entry in `JOB_HANDLERS` in `registry.ts`.
4. In the feature's queue action: `startJobRun(...)` then
   `await runQueuedJobAfterResponse()`.

Nothing else in this directory should change for a new job.
