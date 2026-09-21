import { cache } from "react";
import { cookies } from "next/headers";
import { createNeonClient } from "./data-client";
import { getSession, getAccessToken, type NeonSession } from "./auth";

const SESSION_TTL_MS = 30_000;
const TOKEN_EARLY_REFRESH_MS = 60_000;
const MAX_ENTRIES = 1000;

const sessionCache = new Map<string, { user: NeonSession["user"] | null; expiresAt: number }>();
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function cookieHeader() {
  const store = await cookies();
  return store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

function authKey(header: string) {
  return header
    .split("; ")
    .filter((cookie) => cookie.split("=")[0].includes("neon-auth."))
    .sort()
    .join("; ");
}

function remember<T extends { expiresAt: number }>(store: Map<string, T>, key: string, value: T) {
  if (store.size >= MAX_ENTRIES) {
    const now = Date.now();
    for (const [entryKey, entry] of store) if (entry.expiresAt <= now) store.delete(entryKey);
    if (store.size >= MAX_ENTRIES) store.clear();
  }
  store.set(key, value);
}

function tokenExpiry(token: string) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()) as { exp?: number };
    return payload.exp ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

export function forgetAuthCache(header: string) {
  const key = authKey(header);
  sessionCache.delete(key);
  tokenCache.delete(key);
}

export const getAuthUser = cache(async (): Promise<NeonSession["user"] | null> => {
  const header = await cookieHeader();
  const key = authKey(header);
  if (!key) return null;
  const hit = sessionCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.user;
  const { session, error } = await getSession(header);
  if (error) throw new Error(`session: ${error}`);
  const user = session?.user ?? null;
  remember(sessionCache, key, { user, expiresAt: Date.now() + SESSION_TTL_MS });
  return user;
});

const getToken = cache(async (): Promise<string | null> => {
  const header = await cookieHeader();
  const key = authKey(header);
  if (!key) return null;
  const hit = tokenCache.get(key);
  if (hit && hit.expiresAt - TOKEN_EARLY_REFRESH_MS > Date.now()) return hit.token;
  const { token, error } = await getAccessToken(header);
  if (error) throw new Error(`token: ${error}`);
  if (token) remember(tokenCache, key, { token, expiresAt: tokenExpiry(token) });
  return token;
});

export async function createClient() {
  const token = await getToken();
  return createNeonClient({ accessToken: token ?? undefined });
}

export async function createDeviceClient(deviceId: string) {
  const token = await getToken();
  return createNeonClient({ accessToken: token ?? undefined, deviceId });
}
