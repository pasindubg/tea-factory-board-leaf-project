// Server-only Supabase admin client (auth admin API: create/ban/delete users).
// Uses SUPABASE_SECRET_KEY, which bypasses RLS — NEVER import this from a
// client component, and never use it for tenant data reads/writes (those go
// through the session client so RLS keeps enforcing factory isolation).
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set");
  }
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
