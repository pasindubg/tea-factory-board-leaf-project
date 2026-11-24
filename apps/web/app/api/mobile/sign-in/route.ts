import { NextResponse } from "next/server";
import { getAccessToken, signInWithPassword, signOut } from "@/lib/neon/auth";
import { resolveLoginEmail } from "@/lib/neon/owner-db";
import { cookieForSession, mobileProfileForToken, mobileSessionProof, sessionFromSetCookie } from "@/lib/neon/mobile-session";
import { mobileBoundary, mobileError, mobileJson, mobileObject } from "@/lib/mobile-app";
import { MOBILE_APP_ROLES, roleMayRegisterSuppliers } from "@/lib/roles";

const GENERIC_FAILURE = "Incorrect username or password.";

export async function POST(request: Request) {
  return mobileBoundary(() => signIn(request));
}

async function signIn(request: Request) {
  const input: unknown = await request.json().catch(() => null);
  const body = mobileObject(input) ? input : null;
  const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!username || !password) return NextResponse.json({ error: GENERIC_FAILURE }, { status: 401 });

  let email: string | null;
  try {
    email = await resolveLoginEmail(username);
  } catch (err) {
    console.error("[mobile sign-in] username lookup failed:", err);
    return NextResponse.json({ error: "Could not reach the sign-in service. Please retry." }, { status: 503 });
  }
  if (!email) return NextResponse.json({ error: GENERIC_FAILURE }, { status: 401 });

  const { user, error, setCookie } = await signInWithPassword(email, password);
  const session = sessionFromSetCookie(setCookie);
  if (error || !user || !session) return NextResponse.json({ error: GENERIC_FAILURE }, { status: 401 });

  const cookie = cookieForSession(session);
  let signedIn = false;
  try {
    const { token } = await getAccessToken(cookie);
    if (!token) return mobileError("Could not reach the sign-in service. Please retry.", 503);

    const deviceId = request.headers.get("x-device-id") ?? undefined;
    const proof = mobileSessionProof(session);
    const caller = await mobileProfileForToken(token, MOBILE_APP_ROLES, deviceId, proof);
    if (caller instanceof Response) return caller;
    if (caller.profile.id !== user.id) return mobileError("Could not verify your login.", 401);
    if (roleMayRegisterSuppliers(caller.profile.role)) {
      const device = body?.device;
      if (!deviceId || !/^[a-zA-Z0-9._:-]{8,200}$/.test(deviceId) || !mobileObject(device)
        || device.platform !== "android" || typeof device.model !== "string" || device.model.length > 160
        || typeof device.appVersion !== "string" || device.appVersion.length > 80) {
        return mobileError("Open Tea Factory Field in the Android app to sign in.", 400);
      }
      const result = await caller.supabase.rpc("register_mobile_session", {
        p_platform: device.platform, p_model: device.model, p_app_version: device.appVersion,
      });
      if (result.error) return mobileError("Could not verify your mobile session. Try again.", 503);
      if (result.data === "blocked") {
        return mobileError("This account is already signed in on another device. Sign out there, or ask your factory to release the session.", 409);
      }
      if (result.data !== "bound" && result.data !== "claimed") {
        return mobileError("Could not start a mobile session. Try signing in again.", 503);
      }
    }
    signedIn = true;
    return mobileJson({ session, token, proof, userId: user.id });
  } finally {
    if (!signedIn) await signOut(cookie).catch(() => {});
  }
}
