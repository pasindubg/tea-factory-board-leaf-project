import { type NextRequest, NextResponse } from "next/server";

// Old email links must not establish a session with the retired provider.
export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/login", request.url));
}
