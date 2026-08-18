import "server-only";

import { headers } from "next/headers";
import { getJobsEnv } from "@/lib/env";

/** Where this deployment can reach itself. Taken from the request, never
 * guessed — a hardcoded :3000 posts into a void the moment Next moves to
 * :3001, and every run then sits at "Waiting to start". */
export function baseUrlFromHeaders(source: { get(name: string): string | null }): string | null {
  const host = source.get("x-forwarded-host") ?? source.get("host");
  if (!host) return null;
  const proto =
    source.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Starts a queued run now, rather than leaving it for the once-a-day cron.
 *
 * `baseUrl` is passed by the worker, which calls this from inside `after()`
 * where request APIs are no longer dependable. Never throws — the run row
 * exists either way, and the cron would collect it.
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
      // The tick claims and returns; the chunk runs after the response. So
      // this resolves in ms however long the work takes.
      keepalive: true,
    });
    // Logged, not thrown: a rejected nudge is why a run would sit unstarted.
    if (!response.ok) {
      console.error(
        `[jobs] tick refused the nudge: ${response.status} ${await response.text().catch(() => "")}`.trim(),
      );
    }
  } catch (error) {
    // Loud but never thrown — failing here would fail an upload that
    // succeeded. Usually a missing SUPABASE_JWT_SECRET or JOBS_TICK_SECRET.
    console.error(
      "[jobs] could not nudge the worker; the run stays queued until the cron collects it.",
      error instanceof Error ? error.message : error,
    );
  }
}
