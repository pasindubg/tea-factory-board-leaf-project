import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicEnv } from "@/lib/env";
import { fetchWithTimeout } from "./fetch-timeout";

export function createClient() {
  const { url, publishableKey } = getSupabasePublicEnv();
  return createBrowserClient(
    url,
    publishableKey,
    {
      global: {
        fetch: fetchWithTimeout,
      },
    },
  );
}
