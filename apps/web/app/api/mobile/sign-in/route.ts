import { NextResponse } from "next/server";
import { getAccessToken, signInWithPassword } from "@/lib/neon/auth";
import { resolveLoginEmail } from "@/lib/neon/owner-db";
import { cookieForSession, sessionFromSetCookie } from "@/lib/neon/mobile-session";

const GENERIC_FAILURE = "Incorrect username or password.";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { username?: unknown; password?: unknown } | null;
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

  const { token } = await getAccessToken(cookieForSession(session));
  if (!token) return NextResponse.json({ error: "Could not reach the sign-in service. Please retry." }, { status: 503 });

  return NextResponse.json({ session, token, userId: user.id });
}
