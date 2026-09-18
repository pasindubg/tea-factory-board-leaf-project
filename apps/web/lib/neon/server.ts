import { cache } from "react";
import { cookies } from "next/headers";
import { createNeonClient } from "./data-client";
import { getSession, getAccessToken, type NeonSession } from "./auth";

async function cookieHeader() {
  const store = await cookies();
  return store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

export const getAuthUser = cache(async (): Promise<NeonSession["user"] | null> => {
  const { session, error } = await getSession(await cookieHeader());
  if (error) throw new Error(`session: ${error}`);
  return session?.user ?? null;
});

const getToken = cache(async (): Promise<string | null> => {
  const { token, error } = await getAccessToken(await cookieHeader());
  if (error) throw new Error(`token: ${error}`);
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
