import { NextResponse } from "next/server";
import { signOut } from "@/lib/neon/auth";
import { bearer, cookieForSession } from "@/lib/neon/mobile-session";

export async function POST(request: Request) {
  const session = bearer(request);
  if (session) await signOut(cookieForSession(session));
  return NextResponse.json({ ok: true });
}
