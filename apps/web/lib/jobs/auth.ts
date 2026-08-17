import "server-only";

import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getJobsEnv, getSupabaseEnv } from "@/lib/env";

/**
 * How the worker acts as a person without being one.
 *
 * A run outlives the session that started it — that is the whole point — so
 * there is no session cookie to build a client from. The three ways out are not
 * equal:
 *
 *   the admin client   bypasses RLS entirely. Refused: a bulk job that writes
 *                      invoices must not have tenant isolation resting on every
 *                      query remembering to filter factory_id.
 *   a stored session   means keeping the user's refresh token in a table, which
 *                      is a credential; and signOut() revokes it globally, so it
 *                      would die at exactly the moment a background job matters.
 *   a minted token     is signed here, lives minutes, and is never written down.
 *
 * The token is minted per CHUNK, not per run. A chunk is capped well under a
 * minute by the worker's own budget, so a ten-minute token has an order of
 * magnitude more life than the longest chunk can have — and the next chunk
 * mints a fresh one. A job may run for hours; no token ever needs to.
 */

/**
 * Long enough that no chunk can outlive it, short enough that a leaked token is
 * worth little. Not a limit on how long a job may run.
 */
const TOKEN_TTL_SECONDS = 600;

function base64url(value: string) {
  return Buffer.from(value).toString("base64url");
}

/**
 * A Supabase-shaped HS256 token for one user.
 *
 * Hand-rolled rather than pulling in a JWT library: this signs one fixed claim
 * set with one algorithm, and the whole of it is visible here — which matters
 * more than usual for the thing that decides who the worker is allowed to be.
 */
export function mintJobToken(userId: string): string {
  const { jwtSecret } = getJobsEnv();
  const issuedAt = Math.floor(Date.now() / 1000);

  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      // `sub` is what auth.uid() reads, and therefore what
      // current_factory_id() resolves the tenant from.
      sub: userId,
      role: "authenticated",
      aud: "authenticated",
      iss: "supabase",
      iat: issuedAt,
      exp: issuedAt + TOKEN_TTL_SECONDS,
    }),
  );
  const signature = createHmac("sha256", jwtSecret)
    .update(`${header}.${payload}`)
    .digest("base64url");

  return `${header}.${payload}.${signature}`;
}

/**
 * A Supabase client that IS the given user, for as long as one chunk lasts.
 *
 * Identical in behaviour to the session client every page and action already
 * uses, which is what keeps job code ordinary: `supabase.from(...)` reads and
 * writes under the same policies, and a handler cannot reach another factory's
 * rows even if it forgets to say so.
 */
export function createJobClient(userId: string) {
  const { url, publishableKey } = getSupabaseEnv();
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${mintJobToken(userId)}` } },
  });
}

export type JobClient = ReturnType<typeof createJobClient>;
