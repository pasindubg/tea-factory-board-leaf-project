import { NextResponse, type NextRequest } from "next/server";
import { signOut } from "@/lib/db/session";

const ALLOWED_ERRORS = new Set(["no_profile", "deactivated"]);

function loginUrl(request: NextRequest) {
  const url = new URL("/login", request.url);
  const error = request.nextUrl.searchParams.get("error");
  if (error && ALLOWED_ERRORS.has(error)) url.searchParams.set("error", error);
  return url;
}

async function endSession(request: NextRequest) {
  await signOut();
  return NextResponse.redirect(loginUrl(request));
}

export async function POST(request: NextRequest) {
  return endSession(request);
}

export async function GET(request: NextRequest) {
  return endSession(request);
}
