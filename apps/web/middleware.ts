import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function middleware(request: NextRequest) {
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
    },
  );

  // Refresh the session if expired — required for Server Components. getUser()
  // hits the Supabase auth server, so a flaky network can make it throw or
  // return an error. Fail OPEN in that case: redirecting an authenticated user
  // to /login on a transient blip is worse than letting the request through,
  // and each page's requireProfile re-checks auth anyway (the real gate). We
  // only redirect when we DEFINITIVELY got no user and no error.
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
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
