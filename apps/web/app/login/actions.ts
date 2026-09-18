"use server";

import { cookies } from "next/headers";
import { signInWithPassword } from "@/lib/neon/auth";
import { resolveLoginEmail } from "@/lib/neon/owner-db";
import { dataBackend } from "@/lib/db/session";

export type LoginResult = { ok: true } | { ok: false; error: string };

const GENERIC_FAILURE = "Incorrect username or password.";

export async function signInWithUsername(username: string, password: string): Promise<LoginResult> {
  if (dataBackend() !== "neon") {
    return { ok: false, error: "Username sign-in through this action requires the Neon backend." };
  }

  const clean = username.trim().toLowerCase();
  if (!clean || !password) return { ok: false, error: GENERIC_FAILURE };

  let email: string | null = null;
  try {
    email = await resolveLoginEmail(clean);
  } catch (err) {
    console.error("[login] username lookup failed:", err);
    return { ok: false, error: "Could not reach the sign-in service. Please retry." };
  }
  if (!email) return { ok: false, error: GENERIC_FAILURE };

  const { user, error, setCookie } = await signInWithPassword(email, password);
  if (error || !user) return { ok: false, error: GENERIC_FAILURE };

  const store = await cookies();
  for (const raw of setCookie) {
    const [pair, ...attrs] = raw.split(";");
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const maxAge = attrs
      .map((a) => a.trim().match(/^Max-Age=(\d+)$/i))
      .find(Boolean)?.[1];
    store.set(name, pair.slice(eq + 1).trim(), {
      httpOnly: true,
      secure: /^__(Secure|Host)-/.test(name) || process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      ...(maxAge ? { maxAge: Number(maxAge) } : {}),
    });
  }

  return { ok: true };
}
