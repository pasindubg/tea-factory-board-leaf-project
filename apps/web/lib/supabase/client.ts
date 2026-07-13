import { createBrowserClient } from "@supabase/ssr";
import { fetchWithTimeout } from "./fetch-timeout";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: {
        fetch: fetchWithTimeout,
      },
    },
  );
}
