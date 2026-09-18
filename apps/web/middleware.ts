import { NextResponse, type NextRequest } from "next/server";

// Profile gates validate Neon sessions and permissions on the server.
export function middleware(request: NextRequest) {
  return NextResponse.next({ request });
}
export const config = { matcher: ["/dashboard/:path*", "/login"] };
