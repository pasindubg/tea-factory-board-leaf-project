import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const UNUSED_ANON_KEY = "neon-data-api-ignores-this";

function getDataApiUrl() {
  const url = process.env.NEXT_PUBLIC_NEON_DATA_API_URL;
  if (!url) throw new Error("NEXT_PUBLIC_NEON_DATA_API_URL must be set");
  return url.replace(/\/rest\/v1\/?$/, "");
}

type ClientOptions = {
  accessToken?: string;
  deviceId?: string;
};

export function createNeonClient({ accessToken, deviceId }: ClientOptions = {}): SupabaseClient {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (deviceId) headers["x-device-id"] = deviceId;

  return createClient(getDataApiUrl(), UNUSED_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { headers },
  });
}
