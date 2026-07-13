import { type NextRequest, NextResponse } from "next/server";

const THEMES = new Set(["light", "dark", "system"]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ theme: string }> }) {
  const { theme } = await params;
  if (!THEMES.has(theme)) return new NextResponse("Invalid theme", { status: 400 });

  const referer = request.headers.get("referer");
  let destination = new URL("/dashboard", request.url).toString();
  if (referer) {
    const refererUrl = new URL(referer);
    if (refererUrl.origin === request.nextUrl.origin) destination = refererUrl.toString();
  }
  const response = NextResponse.redirect(destination, 303);

  if (theme === "system") response.cookies.delete("app-theme");
  else response.cookies.set("app-theme", theme, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });

  return response;
}
