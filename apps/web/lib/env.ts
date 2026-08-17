// Single chokepoint for reading which Supabase project this process talks to.
// Every Supabase client construction (server/client/admin/middleware/next.config)
// goes through here so hosted (Vercel) and local dev can never cross-connect by
// accident — hosted must never reach the local stack, and local dev must never
// silently write to the live customer database.
const LOCAL_URL_PATTERN = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/;

function isLocalSupabaseUrl(url: string) {
  return LOCAL_URL_PATTERN.test(url);
}

function assertSafeSupabaseUrl(url: string) {
  const isVercelProd = process.env.VERCEL_ENV === "production";
  const isVercel = !!process.env.VERCEL;
  const isLocal = isLocalSupabaseUrl(url);

  if (isVercelProd && isLocal) {
    throw new Error(
      "Refusing to start: production Vercel deploy is pointed at a local Supabase URL. " +
        "Check NEXT_PUBLIC_SUPABASE_URL in the Vercel project's Production environment.",
    );
  }

  if (!isVercel && !isLocal && process.env.ALLOW_PROD_DB_FROM_LOCAL !== "true") {
    throw new Error(
      "Refusing to start: local dev is pointed at the hosted Supabase project " +
        `(${url}). Point NEXT_PUBLIC_SUPABASE_URL at the local Supabase stack ` +
        "(run `supabase start`, see README), or set ALLOW_PROD_DB_FROM_LOCAL=true " +
        "if this is intentional.",
    );
  }
}

// Browser-safe: only reads NEXT_PUBLIC_ vars, which Next.js inlines into the
// client bundle at build time. No guard here — `process.env.VERCEL`/`VERCEL_ENV`
// aren't inlined for client code, so referencing them from a "use client" file
// would throw at runtime. The guard already ran server-side (see
// getSupabaseEnv below) before this build/boot was allowed to serve anything,
// so the value baked into the client bundle is already vetted.
export function getSupabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set");
  }
  return { url, publishableKey };
}

// Server-only (Node/Edge): same as above, plus the hosted↔local crossover guard.
export function getSupabaseEnv() {
  const { url, publishableKey } = getSupabasePublicEnv();
  assertSafeSupabaseUrl(url);
  return { url, publishableKey };
}

/**
 * What the background-job worker needs, and nothing else.
 *
 * The worker has no session, but it must not fall back to the admin client:
 * that would bypass RLS in a job that writes real invoices, turning tenant
 * isolation from a database guarantee into an application convention. Instead
 * it signs a short-lived token for the run's own user (see lib/jobs/auth.ts),
 * so every policy applies exactly as it would for that person signed in.
 *
 * The signing secret is the project's JWT secret — Supabase ▸ Settings ▸ API.
 * It can mint a token for ANY user, so it is as sensitive as the service key.
 */
export function getJobsEnv() {
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (!jwtSecret) {
    throw new Error(
      "SUPABASE_JWT_SECRET must be set for the background job worker " +
        "(Supabase > Settings > API > JWT Secret)",
    );
  }
  const tickSecret = process.env.JOBS_TICK_SECRET;
  if (!tickSecret) {
    throw new Error("JOBS_TICK_SECRET must be set for the background job worker");
  }
  return { jwtSecret, tickSecret };
}

export function getSupabaseAdminEnv() {
  const { url } = getSupabaseEnv();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("SUPABASE_SECRET_KEY must be set");
  }
  return { url, secretKey };
}
