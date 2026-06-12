/**
 * Dev helper: mint an email OTP for an existing user without sending email.
 * Useful while SMTP is unconfigured — pair it with the login form's
 * "I already have a code" button.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... \
 *     pnpm db:mint-otp collector-a@example.com
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set");

const email = process.argv[2];
if (!email) throw new Error("usage: pnpm db:mint-otp <email>");

const admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  // generateLink(type: magiclink) silently CREATES the auth user if it doesn't
  // exist — refuse first, so this tool can't resurrect removed users.
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw listErr;
  if (!list.users.some((u) => u.email === email)) {
    throw new Error(`No auth user exists for ${email} — minting would create one. Add the user first.`);
  }

  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  console.log(`\n  email: ${email}`);
  console.log(`  code:  ${data.properties.email_otp}\n`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
