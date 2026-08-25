/**
 * Creates real Supabase Auth users for the seed emails and re-links the
 * public.users rows (and collectors.user_id references) to the real auth IDs,
 * so RLS's auth.uid() lookups match. Idempotent — safe to re-run.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, DATABASE_URL.
 */
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { SEED_LOGINS, SEED_PASSWORD } from "./seed-ids";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const dbUrl = process.env.DATABASE_URL;
if (!url || !secretKey || !dbUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY and DATABASE_URL must be set");
}

const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const sql = postgres(dbUrl, { max: 1 });

async function authIdForEmail(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: SEED_PASSWORD,
  });
  if (data.user) return data.user.id;
  if (error && error.code !== "email_exists") throw error;
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email === email);
  if (!existing) throw new Error(`auth user for ${email} not found after email_exists`);
  // Re-assert the password: an auth user that survived a re-seed may have been
  // created before this script set one, or had it changed by hand.
  const { error: pwErr } = await admin.auth.admin.updateUserById(existing.id, { password: SEED_PASSWORD });
  if (pwErr) throw pwErr;
  return existing.id;
}

async function main() {
  for (const { email, username, seedId } of SEED_LOGINS) {
    const authId = await authIdForEmail(email);

    const [row] = await sql`select id from users where email = ${email}`;
    if (!row) throw new Error(`no public.users row for ${email} — run db:seed first`);
    // get_email_for_login resolves username -> email, so a missing username
    // makes password sign-in fail with "Invalid credentials" even though the
    // auth user and its password are fine.
    await sql`update users set username = ${username} where email = ${email} and username is distinct from ${username}`;
    if (row.id === authId) {
      console.log(`ok        ${email} already linked to ${authId}`);
      continue;
    }

    // users.id is referenced by collectors.user_id, so: copy row under the
    // new id, repoint collectors, then drop the old row.
    await sql.begin(async (tx) => {
      await tx`
        insert into users (id, factory_id, name, email, phone, username, role, active, created_at)
        select ${authId}, factory_id, name, email, phone, username, role, active, created_at
        from users where id = ${row.id}
        on conflict (id) do nothing`;
      await tx`update collectors set user_id = ${authId} where user_id = ${row.id}`;
      await tx`delete from users where id = ${row.id}`;
    });
    console.log(`linked    ${email}  ${seedId} -> ${authId}`);
  }
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
