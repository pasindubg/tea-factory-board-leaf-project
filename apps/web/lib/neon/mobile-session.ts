import "server-only";
import { NextResponse } from "next/server";
import { createNeonClient } from "./data-client";

const SESSION_COOKIE = "__Secure-neon-auth.session_token";

export function sessionFromSetCookie(setCookie: string[]): string | null {
  for (const raw of setCookie) {
    const [pair] = raw.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0 && pair.slice(0, eq).trim() === SESSION_COOKIE) return pair.slice(eq + 1).trim();
  }
  return null;
}

export function cookieForSession(session: string) {
  return `${SESSION_COOKIE}=${session}`;
}

export function bearer(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export const unauthorized = () => NextResponse.json({ error: "Not signed in." }, { status: 401 });

export type MobileCaller = { factoryId: string; role: string; deviceBound: boolean };

export async function mobileCaller(request: Request): Promise<MobileCaller | null> {
  const accessToken = bearer(request);
  if (!accessToken) return null;
  const deviceId = request.headers.get("x-device-id") ?? undefined;
  const db = createNeonClient({ accessToken, deviceId });
  const [factory, role, bound] = await Promise.all([
    db.rpc("current_factory_id"),
    db.rpc("current_user_role"),
    db.rpc("device_is_bound"),
  ]);
  if (factory.error || role.error || !factory.data || !role.data) return null;
  return { factoryId: String(factory.data), role: String(role.data), deviceBound: bound.data === true };
}
