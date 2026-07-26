// Server-only Supabase admin client (auth admin API: create/ban/delete users).
// Uses SUPABASE_SECRET_KEY, which bypasses RLS — NEVER import this from a
// client component, and never use it for tenant data reads/writes (those go
// through the session client so RLS keeps enforcing factory isolation).
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminEnv } from "@/lib/env";

export function createAdminClient() {
  const { url, secretKey } = getSupabaseAdminEnv();
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
