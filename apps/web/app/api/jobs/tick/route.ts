import { after, NextResponse } from "next/server";
import { getJobsEnv } from "@/lib/env";
import { baseUrlFromHeaders } from "@/lib/jobs/trigger";
import { claimRun, runChunk } from "@/lib/jobs/worker";

/**
 * The worker endpoint. Claims one run, responds, then does a slice.
 *
 * It responds BEFORE it works because the handover is an HTTP call to itself:
 * working first would make every tick hold a connection open across its
 * successor's whole chunk, nested, until the platform killed the stack.
 *
 * This is only ONE way in — the upload starts its first chunk in process, with
 * no request at all (lib/jobs/worker.ts). The cron in vercel.json is a backstop
 * Hobby caps at once a day, and Execute is the deliberate recovery path.
 */

// Node, not Edge: minting a token uses node:crypto.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// No maxDuration export on purpose: it can only shorten things. Hobby's
// default and maximum are both 300s (fluid compute), so declaring 60 cut every
// chunk to a fifth. If chunks come back short, check Settings > Functions >
// Default Max Duration.

function authorised(request: Request, secret: string) {
  // Vercel signs its own cron invocations; anything else must present the
  // secret. This route causes tenant writes, so it is never open.
  if (request.headers.get("x-vercel-cron")) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  let env;
  try {
    env = getJobsEnv();
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
  if (!authorised(request, env.tickSecret)) {
    return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  }

  let run;
  try {
    run = await claimRun();
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
  if (!run) return NextResponse.json({ claimed: 0 });

  // Read now: inside after() the response has gone and request APIs are no
  // longer dependable, but the chain needs a URL.
  const selfBase = baseUrlFromHeaders(request.headers);
  after(async () => { await runChunk(run, selfBase); });

  return NextResponse.json({ claimed: 1, runId: run.id, jobKey: run.jobKey, status: "running" });
}

/** Rejects a browser that wanders onto the URL, rather than 405-ing obscurely. */
export function GET() {
  return NextResponse.json({ error: "POST only." }, { status: 405 });
}
