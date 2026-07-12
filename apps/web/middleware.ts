import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { fetchWithTimeout } from "@/lib/supabase/fetch-timeout";

type CookieToSet = { name: string; value: string; options: CookieOptions };

function isSupabaseAuthCookie(name: string) {
  return name.startsWith("sb-") && name.includes("-auth-token");
}

function redirectToLogin(request: NextRequest, error?: string) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  if (error) url.searchParams.set("error", error);

  const response = NextResponse.redirect(url);
  request.cookies.getAll().forEach((cookie) => {
    if (isSupabaseAuthCookie(cookie.name)) {
      response.cookies.delete(cookie.name);
    }
  });
  return response;
}

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/login") {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
      global: {
        fetch: fetchWithTimeout,
      },
    },
  );

  // Refresh the session if expired — required for Server Components. getUser()
  // hits the Supabase auth server, so a dev reload or flaky network can make it
  // throw or return an error. Fail OPEN in that case: redirecting an
  // authenticated user to /login on a transient blip would delete valid auth
  // cookies and turn a temporary verification miss into a real logout. Each
  // page's requireProfile re-checks auth anyway (the real gate). We only
  // redirect when we DEFINITIVELY got no user and no error.
  let user = null;
  let couldNotVerify = false;
  try {
    const { data, error } = await supabase.auth.getUser();
    user = data.user;
    couldNotVerify = !!error;
  } catch {
    couldNotVerify = true;
  }

  if (!user && !couldNotVerify && request.nextUrl.pathname.startsWith("/dashboard")) {
    return redirectToLogin(request);
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
