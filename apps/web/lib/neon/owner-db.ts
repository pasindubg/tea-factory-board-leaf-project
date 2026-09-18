import "server-only";
import { neon } from "@neondatabase/serverless";
import postgres from "postgres";

let pool: ReturnType<typeof postgres> | null = null;

export async function resolveLoginEmail(username: string): Promise<string | null> {
  const url = process.env.NEON_DATABASE_URL;
  if (!url) throw new Error("NEON_DATABASE_URL must be set");

  const sql = neon(url.replace(/^"|"$/g, ""));
  const rows = await sql`select public.get_email_for_login(${username}) as email`;
  return typeof rows[0]?.email === "string" ? rows[0].email : null;
}

export function ownerDb() {
  const url = process.env.NEON_DATABASE_URL;
  if (!url) throw new Error("NEON_DATABASE_URL must be set");
  pool ??= postgres(url.replace(/^"|"$/g, ""), { max: 3, prepare: false, idle_timeout: 20 });
  return pool;
}
