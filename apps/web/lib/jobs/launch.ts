import "server-only";

import { after } from "next/server";
import { headers } from "next/headers";
import { baseUrlFromHeaders } from "@/lib/jobs/trigger";
import { claimAndRunChunk } from "@/lib/jobs/worker";

/**
 * The ONE way a feature action starts the worker on a run it just queued.
 *
 * Call it once, after startJobRun succeeds, from inside the request. The first
 * chunk then runs HERE, in this invocation, after the response — no HTTP to
 * ourselves. That self-call is what kept failing silently, leaving runs at
 * "Waiting to start"; after() already outlives the response. The base URL is
 * only for the chunk-to-chunk handover, and is read now because headers() is
 * not dependable inside after().
 *
 * Feature code (queue actions, handlers) must not import worker/trigger
 * internals directly — this façade is the whole surface. See lib/jobs/AGENTS.md.
 */
export async function runQueuedJobAfterResponse(): Promise<void> {
  const base = baseUrlFromHeaders(await headers());
  after(async () => { await claimAndRunChunk(base); });
}
