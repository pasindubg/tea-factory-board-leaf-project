/**
 * M2 verification gate: real Supabase Auth + RLS, end to end.
 *
 * Uses the admin API to mint an email OTP (no inbox needed), logs in through
 * the public client exactly like the web app does, then checks:
 *   1. owner A's role allows the web dashboard and sees only factory A data
 *   2. collector A authenticates but their role is rejected by the dashboard
 *   3. an unknown email cannot request an OTP (shouldCreateUser: false)
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
 * SUPABASE_SECRET_KEY. Run db:seed + db:link-auth first.
 */
import { createClient } from "@supabase/supabase-js";
import { SEED_IDS } from "./seed-ids";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const secretKey = process.env.SUPABASE_SECRET_KEY!;
if (!url || !publishableKey || !secretKey) throw new Error("Supabase env vars must be set");

const admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

/** Log in the way the web login form does, but with an admin-minted OTP. */
async function loginAs(email: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const client = createClient(url, publishableKey, { auth: { persistSession: false } });
  const { data: session, error: verifyErr } = await client.auth.verifyOtp({
    email,
    token: data.properties.email_otp,
    type: "email",
  });
  if (verifyErr) throw verifyErr;
  return { client, userId: session.user!.id };
}

async function main() {
  // 1. Owner A: allowed on web, factory-scoped
  const ownerA = await loginAs("owner-a@example.com");
  const { data: ownerProfile } = await ownerA.client
    .from("users")
    .select("role, factory_id")
    .eq("id", ownerA.userId)
    .single();
  check(
    "owner A profile resolves with web-allowed role",
    ownerProfile?.role === "owner" && ownerProfile?.factory_id === SEED_IDS.factoryA,
    `role=${ownerProfile?.role} factory=${ownerProfile?.factory_id}`,
  );

  const { data: ownerSuppliers } = await ownerA.client.from("suppliers").select("factory_id");
  const supplierFactories = [...new Set((ownerSuppliers ?? []).map((s) => s.factory_id))];
  check(
    "owner A sees only factory A suppliers via authenticated client",
    supplierFactories.length === 1 && supplierFactories[0] === SEED_IDS.factoryA,
    `factories=${JSON.stringify(supplierFactories)} (${ownerSuppliers?.length ?? 0} rows)`,
  );

  // 2. Collector A: authenticates and resolves the collector role (the web
  // app gives this role the restricted weighing-entry interface — M5)
  const collectorA = await loginAs("collector-a@example.com");
  const { data: collectorProfile } = await collectorA.client
    .from("users")
    .select("role")
    .eq("id", collectorA.userId)
    .single();
  check(
    "collector A authenticates and resolves collector role",
    collectorProfile?.role === "collector",
    `role=${collectorProfile?.role} (web shows weighings-only interface for this role)`,
  );

  // 3. Unknown email cannot request an OTP the way the login form asks for it
  const anonClient = createClient(url, publishableKey, { auth: { persistSession: false } });
  const { error: unknownErr } = await anonClient.auth.signInWithOtp({
    email: "stranger@example.com",
    options: { shouldCreateUser: false },
  });
  check(
    "unknown email cannot sign in (no self-signup)",
    unknownErr !== null,
    unknownErr ? `rejected: ${unknownErr.message}` : "OTP was issued — should not happen",
  );

  console.log(failures === 0 ? "\nAuth verification: ALL CHECKS PASSED" : `\nAuth verification: ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
