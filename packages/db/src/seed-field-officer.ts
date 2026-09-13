/**
 * Creates one field_officer login for testing the Expo field app against the
 * LOCAL stack. Safe to re-run. Dev only — it refuses a non-local database.
 *
 *   pnpm --dir packages/db db:seed-field-officer
 */
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

const EMAIL = "field-a@example.com";
const USERNAME = "field.a";
const PASSWORD = "fieldofficer123";
const NAME = "Field Officer A";

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!dbUrl || !supabaseUrl || !secret) throw new Error("Source .env first (DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY)");
  if (!/127\.0\.0\.1|localhost/.test(supabaseUrl)) {
    throw new Error(`Refusing to run against ${supabaseUrl} — this script is for the local stack only.`);
  }

  const sql = postgres(dbUrl, { max: 1 });
  const admin = createClient(supabaseUrl, secret, { auth: { autoRefreshToken: false, persistSession: false } });

  const [factory] = await sql<{ id: string; name: string }[]>`select id, name from factories order by name limit 1`;
  if (!factory) throw new Error("no factories — run db:seed first");

  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list?.users.find((user) => user.email === EMAIL);
  const authId = existing
    ? (await admin.auth.admin.updateUserById(existing.id, { password: PASSWORD }), existing.id)
    : (await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true })).data.user!.id;

  await sql`
    insert into users (id, factory_id, name, email, username, role, active)
    values (${authId}, ${factory.id}, ${NAME}, ${EMAIL}, ${USERNAME}, 'field_officer', true)
    on conflict (id) do update set role = 'field_officer', active = true, username = ${USERNAME}`;

  console.log(`field officer ready on ${factory.name}`);
  console.log(`  username  ${USERNAME}`);
  console.log(`  password  ${PASSWORD}`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
