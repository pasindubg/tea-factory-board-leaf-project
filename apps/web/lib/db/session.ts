import "server-only";
import { createClient as createNeonClient, getAuthUser as getNeonUser } from "@/lib/neon/server";
import { signOut as neonSignOut } from "@/lib/neon/auth";
import { cookies } from "next/headers";

export type DataBackend = "neon";
export function dataBackend(): DataBackend {
  if (process.env.NEXT_PUBLIC_DATA_BACKEND && process.env.NEXT_PUBLIC_DATA_BACKEND !== "neon") {
    throw new Error("This application requires the Neon backend.");
  }
  return "neon";
}

export async function createClient() {
  dataBackend();
  return createNeonClient();
}

export type AuthUser = { id: string; email?: string | null };
export async function getAuthUser(): Promise<AuthUser | null> {
  const user = await getNeonUser();
  return user ? { id: user.id, email: user.email } : null;
}

export async function signOut() {
  const store = await cookies();
  const all = store.getAll();
  const header = all.map((c) => `${c.name}=${c.value}`).join("; ");
  const { error } = await neonSignOut(header);
  if (error) throw new Error("Could not end the session. Please retry.");
  for (const { name } of all) {
    if (!name.includes("neon-auth.")) continue;
    store.set(name, "", {
      maxAge: 0, path: "/", httpOnly: true, sameSite: "lax",
      secure: /^__(Secure|Host)-/.test(name) || process.env.NODE_ENV === "production",
    });
  }
}
