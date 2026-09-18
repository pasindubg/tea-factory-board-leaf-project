import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { accessToken } from "./auth";
import { getDeviceId } from "./device";
import { dataApiUrl } from "./env";

// Every request carries the phone's device id. RLS reads it back through
// public.current_device_id() to refuse a field officer's write from any other
// handset (migration 0065).
async function fetchWithDeviceId(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("x-device-id", await getDeviceId());
  return fetch(input, { ...init, headers });
}

export const supabase = createClient(dataApiUrl, "neon-data-api", {
  accessToken,
  global: { fetch: fetchWithDeviceId },
});
