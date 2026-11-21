import "server-only";
import { NextResponse } from "next/server";
import { requireMobileProfile } from "@/lib/neon/mobile-session";
import { MOBILE_APP_ROLES, MOBILE_SUPPLIER_REGISTRATION_ROLES } from "@/lib/roles";
import { friendlyError } from "@/lib/errors";

export type MobileContext = Exclude<Awaited<ReturnType<typeof requireMobileProfile>>, Response>;
export const MOBILE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function mobileJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
export const mobileError = (error: string, status = 400) => mobileJson({ error }, status);
export function mobileObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}
export function onlyMobileKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

export async function linkedMobileSupplier({ profile, supabase }: MobileContext) {
  if (!profile.supplier_id) return null;
  const result = await supabase.from("suppliers").select("id, name, area")
    .eq("id", profile.supplier_id).maybeSingle();
  if (result.error) throw new Error(friendlyError(result.error));
  return result.data as { id: string; name: string; area: string | null } | null;
}

export async function linkedMobileCollector({ profile, supabase }: MobileContext) {
  const result = await supabase.from("collectors").select("id, name, area")
    .eq("user_id", profile.id).maybeSingle();
  if (result.error) throw new Error(friendlyError(result.error));
  return result.data as { id: string; name: string; area: string | null } | null;
}

export async function mobileBootstrap(request: Request) {
  const caller = await requireMobileProfile(request, MOBILE_APP_ROLES);
  if (caller instanceof Response) return caller;
  const { profile } = caller;
  const supplier = profile.role === "supplier" ? await linkedMobileSupplier(caller) : null;
  const collector = profile.role === "collector" ? await linkedMobileCollector(caller) : null;
  return mobileJson({
    profile: { id: profile.id, name: profile.name, role: profile.role, factory_id: profile.factory_id, supplier_id: profile.supplier_id ?? null },
    supplier, collector,
  });
}

export async function mobileBindDevice(request: Request, input: unknown) {
  const caller = await requireMobileProfile(request, MOBILE_SUPPLIER_REGISTRATION_ROLES);
  if (caller instanceof Response) return caller;
  if (!mobileObject(input) || !onlyMobileKeys(input, ["platform", "model", "appVersion"])) return mobileError("Invalid device details.");
  const deviceId = request.headers.get("x-device-id") ?? "";
  if (!/^[a-zA-Z0-9._:-]{8,200}$/.test(deviceId)) return mobileError("A valid device identifier is required.");
  const platform = input.platform;
  if (platform !== "android" && platform !== "ios" && platform !== "web") return mobileError("Unsupported device platform.");
  if (typeof input.model !== "string" || input.model.length > 160 || typeof input.appVersion !== "string" || input.appVersion.length > 80) return mobileError("Invalid device details.");
  // The audited RPC derives factory/user identity from the session. The device
  // parameter is the same identifier that accompanies all Data API requests.
  const result = await caller.supabase.rpc("register_device", {
    p_device_id: deviceId, p_platform: platform, p_model: input.model, p_app_version: input.appVersion,
  });
  if (result.error) return mobileError(friendlyError(result.error));
  const binding = result.data;
  if (!["bound", "claimed", "blocked", "invalid"].includes(binding)) return mobileError("Could not verify this device.", 503);
  return mobileJson({ binding });
}

/** Route boundary for failures before a response exists; never leak DB details. */
export async function mobileBoundary(work: () => Promise<Response>) {
  try { return await work(); } catch (error) {
    console.error("[mobile API] request failed", error);
    return mobileError("The mobile service is temporarily unavailable. Please try again.", 503);
  }
}
