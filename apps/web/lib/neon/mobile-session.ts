import "server-only";
import { NextResponse } from "next/server";
import { createNeonClient } from "./data-client";
import { withTenantDataScope } from "@/lib/tenant-data";
import type { Role } from "@/lib/roles";

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

/** Bearer-session counterpart of requireProfile: resolve identity through RLS,
 * then return only the factory-scoped session client for domain operations. */
export async function requireMobileProfile(request: Request, allowedRoles: readonly Role[]) {
  const accessToken = bearer(request);
  if (!accessToken) return unauthorized();
  const db = createNeonClient({ accessToken, deviceId: request.headers.get("x-device-id") ?? undefined });
  const [identity, factory, bound] = await Promise.all([
    db.rpc("request_uid"), db.rpc("current_factory_id"), db.rpc("device_is_bound"),
  ]);
  if (identity.error || factory.error || !identity.data || !factory.data) return unauthorized();
  const supabase = withTenantDataScope(db, { factoryId: String(factory.data), actorUserId: String(identity.data) });
  const { data, error } = await supabase.from("users")
    .select("id, name, role, factory_id, supplier_id, active").eq("id", String(identity.data)).maybeSingle();
  if (error || !data) return unauthorized();
  const profile = data as { id: string; name: string; role: Role; factory_id: string; supplier_id: string | null; active: boolean | null };
  if (profile.active === false || !allowedRoles.includes(profile.role)) {
    return NextResponse.json({ error: "This account cannot perform this mobile operation." }, { status: 403 });
  }
  return { profile, supabase, deviceBound: !bound.error && bound.data === true };
}

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
