import { getAccessToken } from "@/lib/neon/auth";
import { mobileBoundary, mobileError, mobileJson } from "@/lib/mobile-app";
import { bearer, cookieForSession, mobileSessionProof, unauthorized } from "@/lib/neon/mobile-session";

export async function POST(request: Request) {
  return mobileBoundary(async () => {
    const session = bearer(request);
    if (!session) return unauthorized();

    const { token, error } = await getAccessToken(cookieForSession(session));
    if (error) return mobileError("Could not verify your session. Try again.", 503);
    if (!token) return unauthorized();
    return mobileJson({ token, proof: mobileSessionProof(session) });
  });
}
