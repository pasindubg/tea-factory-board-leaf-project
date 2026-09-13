import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { getDeviceId } from "./device";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.",
  );
}

// The mobile counterpart of apps/web/lib/env.ts: a release build must never
// carry a developer's local stack, which is unreachable off that machine and
// would fail in the field with no obvious cause. Dev builds may point anywhere.
const LOCAL_HOST = /^https?:\/\/(localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
if (!__DEV__ && LOCAL_HOST.test(url)) {
  throw new Error(
    `This release build points at ${url}, which is only reachable on the developer's network. Set EXPO_PUBLIC_SUPABASE_URL in apps/mobile/.env.production.`,
  );
}

// Every request carries the phone's device id. RLS reads it back through
// public.current_device_id() to refuse a field officer's write from any other
// handset (migration 0065).
async function fetchWithDeviceId(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("x-device-id", await getDeviceId());
  return fetch(input, { ...init, headers });
}

export const supabase = createClient(url, key, {
  global: { fetch: fetchWithDeviceId },
  auth: {
    // React Native: persist the session in AsyncStorage and refresh tokens in
    // the background. There is no URL to parse for OAuth redirects here.
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
