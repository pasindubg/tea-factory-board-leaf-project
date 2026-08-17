import "server-only";

import { headers } from "next/headers";
import { getJobsEnv } from "@/lib/env";

/**
 * Where this deployment can reach itself.
 *
 * Taken from the request that is asking, not guessed. The guess was a
 * hardcoded :3000, which is wrong the moment a dev server is started while
 * another holds that port — Next quietly moves to :3001 and every nudge then
 * posts into a void, leaving runs at "Waiting to start" with nothing to show
 * for it. The incoming host is always right, locally and on Vercel, on any
 * port and any domain.
 */
export function baseUrlFromHeaders(source: { get(name: string): string | null }): string | null {
  const host = source.get("x-forwarded-host") ?? source.get("host");
  if (!host) return null;
  const proto =
    source.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Nudges the worker so a run that was just queued starts now.
 *
 * Without this a run waits for the cron, and on Hobby the cron fires once a
 * day — which would make "queued" indistinguishable from broken. With it, the
 * cron stops being the thing that starts work and becomes only the safety net
 * that picks up whatever was left behind.
 *
 * `baseUrl` is passed explicitly by the worker, which calls this from inside
 * `after()` — request APIs are not reliably readable once the response has
 * gone, so the URL is captured while the request is still in hand.
 *
 * Deliberately never throws: the run row already exists, so the work is not
 * lost if this request fails. The cron would collect it.
 */
export async function triggerJobTick(baseUrl?: string): Promise<void> {
  try {
    const { tickSecret } = getJobsEnv();

    const base =
      baseUrl ??
      baseUrlFromHeaders(await headers()) ??
      process.env.JOBS_TICK_BASE_URL ??
      "http://127.0.0.1:3000";

    const response = await fetch(`${base}/api/jobs/tick`, {
      method: "POST",
      headers: { authorization: `Bearer ${tickSecret}` },
      // The tick claims a run and returns; the chunk itself runs on after the
      // response. So this resolves in milliseconds however long the work takes,
      // which is what lets one chunk hand over to the next without the caller
      // holding a connection open across it.
      keepalive: true,
    });
    // Reported, not thrown. A rejected nudge is why a run would sit at
    // "Waiting to start", and that has to be findable in the log rather than
    // looking like the worker simply chose not to run.
    if (!response.ok) {
      console.error(
        `[jobs] tick refused the nudge: ${response.status} ${await response.text().catch(() => "")}`.trim(),
      );
    }
  } catch (error) {
    // Never thrown: the run row already exists, so the work is not lost, and
    // failing here would fail an upload that actually succeeded. But it is
    // LOUD, because the most likely cause is a missing SUPABASE_JWT_SECRET or
    // JOBS_TICK_SECRET — and swallowing that in silence is what made a queued
    // run look like a broken worker instead of an unset variable.
    console.error(
      "[jobs] could not nudge the worker; the run stays queued until the cron collects it.",
      error instanceof Error ? error.message : error,
    );
  }
}
