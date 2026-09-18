import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/neon/auth";
import { bearer, cookieForSession, unauthorized } from "@/lib/neon/mobile-session";

export async function POST(request: Request) {
  const session = bearer(request);
  if (!session) return unauthorized();

  const { token, error } = await getAccessToken(cookieForSession(session));
  if (error) return NextResponse.json({ error }, { status: 503 });
  if (!token) return unauthorized();

  return NextResponse.json({ token });
}
