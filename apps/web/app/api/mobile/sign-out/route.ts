import { NextResponse } from "next/server";
import { signOut } from "@/lib/neon/auth";
import { bearer, cookieForSession } from "@/lib/neon/mobile-session";

export async function POST(request: Request) {
  const session = bearer(request);
  if (session) {
    try {
      const { error } = await signOut(cookieForSession(session));
      if (error) return NextResponse.json({ error: "Could not sign out. Try again." }, { status: 503 });
    } catch {
      return NextResponse.json({ error: "Could not sign out. Try again." }, { status: 503 });
    }
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
