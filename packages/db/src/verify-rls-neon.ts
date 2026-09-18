import postgres from "postgres";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { SEED_IDS } from "./seed-ids";

const PRODUCTION_ENDPOINT = "ep-sweet-river-azg84cej";

const dbUrl = process.env.NEON_DATABASE_URL?.replace(/^"|"$/g, "");
const authBase = process.env.NEON_AUTH_BASE_URL?.replace(/\/$/, "");
const dataBase = process.env.NEON_DATA_API_URL?.replace(/\/rest\/v1\/?$/, "");
if (!dbUrl || !authBase || !dataBase) {
  throw new Error("NEON_DATABASE_URL, NEON_AUTH_BASE_URL and NEON_DATA_API_URL must all point at the branch under test");
}

const host = new URL(dbUrl).hostname;
if (host.includes(PRODUCTION_ENDPOINT)) throw new Error("Refusing to run against the production branch.");
if (process.env.VERIFY_ALLOW_HOST !== host) {
  throw new Error(`This suite resets seed-user passwords and writes test rows. Name the branch: VERIFY_ALLOW_HOST=${host}`);
}

const sql = postgres(dbUrl, { max: 1, prepare: false });
const ORIGIN = "http://localhost:3000";

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password.normalize("NFKC"), salt, 64, { N: 16384, r: 16, p: 1, maxmem: 128 * 16384 * 16 * 2 });
  return `${salt}:${key.toString("hex")}`;
}

async function signIn(userId: string, email: string): Promise<SupabaseClient> {
  const password = `Verify-${randomBytes(12).toString("hex")}!A1`;
  await sql.begin(async (tx) => {
    const stale = await tx`select id from neon_auth."user" where email = ${email} and id <> ${userId}`;
    const staleIds = stale.map((r) => r.id as string);
    if (staleIds.length) {
      await tx`delete from neon_auth.session where "userId" = any(${staleIds}::uuid[])`;
      await tx`delete from neon_auth.account where "userId" = any(${staleIds}::uuid[])`;
      await tx`delete from neon_auth."user" where id = any(${staleIds}::uuid[])`;
    }
    await tx`
      insert into neon_auth."user" (id, name, email, "emailVerified", role, banned, "createdAt", "updatedAt")
      values (${userId}, ${email}, ${email}, true, 'user', false, now(), now())
      on conflict (id) do update set email = excluded.email, banned = false`;
    await tx`delete from neon_auth.account where "userId" = ${userId} and "providerId" = 'credential'`;
    await tx`
      insert into neon_auth.account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
      values (${randomUUID()}, ${userId}, 'credential', ${userId}, ${hashPassword(password)}, now(), now())`;
  });

  const res = await fetch(`${authBase}/sign-in/email`, {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`sign-in failed for ${email}: HTTP ${res.status}`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const token = ((await (await fetch(`${authBase}/token`, { headers: { Origin: ORIGIN, Cookie: cookie } })).json()) as { token?: string }).token;
  if (!token) throw new Error(`no Data API token for ${email}`);

  return createClient(dataBase!, "unused", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

const distinct = (rows: Record<string, unknown>[] | null, key: string) => [...new Set((rows ?? []).map((r) => r[key]))];

function validSupplier(factoryId: string) {
  return {
    factory_id: factoryId,
    name: "RLS probe",
    phone: "0770000000",
    latitude: 7.0,
    longitude: 80.0,
    customer_no: String(Date.now()).slice(-9) + String(Math.floor(Math.random() * 1000)),
  };
}

async function main() {
  const [ownerARow] = await sql`select id, email from users where email = 'owner-a@example.com'`;
  const [ownerBRow] = await sql`select id, email from users where email = 'owner-b@example.com'`;
  const [collectorAUser] = await sql`select id, email from users where email = 'collector-a@example.com'`;
  if (!ownerARow || !ownerBRow || !collectorAUser) throw new Error("Seed users not found — run db:seed on this branch first");

  const [collectorA] = await sql`select id from collectors where user_id = ${collectorAUser.id} and factory_id = ${SEED_IDS.factoryA}`;
  const [collectorB] = await sql`select id from collectors where factory_id = ${SEED_IDS.factoryB} limit 1`;
  const [supplierA] = await sql`select id from suppliers where factory_id = ${SEED_IDS.factoryA} and active is distinct from false limit 1`;
  if (!collectorA || !collectorB || !supplierA) throw new Error("Seed collector/supplier rows not found — run db:seed first");

  const ownerA = await signIn(ownerARow.id, ownerARow.email);
  const ownerB = await signIn(ownerBRow.id, ownerBRow.email);
  const collector = await signIn(collectorAUser.id, collectorAUser.email);

  const aWeighings = await ownerA.from("weighings").select("factory_id");
  const aSuppliers = await ownerA.from("suppliers").select("factory_id");
  const aFactories = await ownerA.from("factories").select("id");
  const aRoles = await ownerA.from("access_roles").select("factory_id");
  check("owner A sees only factory A weighings", JSON.stringify(distinct(aWeighings.data, "factory_id")) === JSON.stringify([SEED_IDS.factoryA]), JSON.stringify(distinct(aWeighings.data, "factory_id")));
  check("owner A sees only factory A suppliers", JSON.stringify(distinct(aSuppliers.data, "factory_id")) === JSON.stringify([SEED_IDS.factoryA]), JSON.stringify(distinct(aSuppliers.data, "factory_id")));
  check("owner A sees only their own factory row", JSON.stringify(distinct(aFactories.data, "id")) === JSON.stringify([SEED_IDS.factoryA]), JSON.stringify(distinct(aFactories.data, "id")));
  check("owner A sees only factory A access roles", JSON.stringify(distinct(aRoles.data, "factory_id")) === JSON.stringify([SEED_IDS.factoryA]), JSON.stringify(distinct(aRoles.data, "factory_id")));

  const bWeighings = await ownerB.from("weighings").select("factory_id");
  check("owner B sees only factory B weighings", JSON.stringify(distinct(bWeighings.data, "factory_id")) === JSON.stringify([SEED_IDS.factoryB]), JSON.stringify(distinct(bWeighings.data, "factory_id")));

  const parallel = await Promise.all(Array.from({ length: 120 }, async (_, i) => {
    const client = i % 2 ? ownerA : ownerB;
    const expected = i % 2 ? SEED_IDS.factoryA : SEED_IDS.factoryB;
    const result = await client.from("factories").select("id");
    return !result.error && result.data?.length === 1 && result.data[0].id === expected;
  }));
  check("concurrent requests retain the correct factory identity", parallel.every(Boolean), `${parallel.filter(Boolean).length}/${parallel.length}`);
  const forbiddenClaim = await ownerA.rpc("claim_background_job", { p_worker_id: "security-probe", p_lease_seconds: 1 });
  check("ordinary users cannot invoke privileged job claims", forbiddenClaim.error?.code === "42501", forbiddenClaim.error?.code ?? "not denied");
  const forbiddenLookup = await ownerA.rpc("get_email_for_login", { p_username: "owner.b" });
  check("ordinary users cannot enumerate login emails", forbiddenLookup.error?.code === "42501", forbiddenLookup.error?.code ?? "not denied");

  const ownSupplier = await ownerA.from("suppliers").insert(validSupplier(SEED_IDS.factoryA)).select("id");
  check("control: the probe supplier is valid in owner A's own factory", !ownSupplier.error, ownSupplier.error?.message ?? "inserted");
  const probeId = ownSupplier.data?.[0]?.id;
  if (!probeId) throw new Error("Valid control row missing");
  const forgedFactory = await ownerA.from("suppliers").update({ factory_id: SEED_IDS.factoryB }).eq("id", probeId);
  check("factory_id cannot be reassigned to another tenant", forgedFactory.error?.code === "42501", forgedFactory.error?.code ?? "not denied");
  const foreignUpdate = await ownerB.from("suppliers").update({ name: "forged" }).eq("id", probeId).select("id");
  check("cross-factory update cannot touch a known row id", !foreignUpdate.error && foreignUpdate.data?.length === 0, foreignUpdate.error?.message ?? `${foreignUpdate.data?.length} rows`);
  const foreignDelete = await ownerB.from("suppliers").delete().eq("id", probeId).select("id");
  check("cross-factory delete cannot touch a known row id", !foreignDelete.error && foreignDelete.data?.length === 0, foreignDelete.error?.message ?? `${foreignDelete.data?.length} rows`);
  const crossSupplier = await ownerA.from("suppliers").insert(validSupplier(SEED_IDS.factoryB)).select("id");
  check("owner A cannot insert a supplier into factory B", !!crossSupplier.error, crossSupplier.error ? `rejected (${crossSupplier.error.code})` : "insert was ALLOWED");

  const ownRole = await ownerA.from("access_roles").insert({ factory_id: SEED_IDS.factoryA, key: `probe-${randomUUID()}`, name: `Probe role ${randomUUID().slice(0, 8)}`, base_role: "manager" }).select("id");
  check("control: the probe role is valid in owner A's own factory", !ownRole.error, ownRole.error?.message ?? "inserted");
  const crossRole = await ownerA.from("access_roles").insert({ factory_id: SEED_IDS.factoryB, key: `forged-${randomUUID()}`, name: `Forged role ${randomUUID().slice(0, 8)}`, base_role: "manager" }).select("id");
  check("owner A cannot create a role in factory B", !!crossRole.error, crossRole.error ? `rejected (${crossRole.error.code})` : "insert was ALLOWED");

  const validWeighing = await collector.from("weighings").insert({
    id: randomUUID(), factory_id: SEED_IDS.factoryA, supplier_id: supplierA.id, collector_id: collectorA.id, weight_kg: 1, collected_at: new Date().toISOString(),
  }).select("id");
  check("collector can insert a weighing as their linked collector", !validWeighing.error, validWeighing.error?.message ?? "insert allowed");

  const forgedWeighing = await collector.from("weighings").insert({
    id: randomUUID(), factory_id: SEED_IDS.factoryA, supplier_id: supplierA.id, collector_id: collectorB.id, weight_kg: 1, collected_at: new Date().toISOString(),
  }).select("id");
  check("collector cannot forge another collector on a weighing", !!forgedWeighing.error, forgedWeighing.error ? `rejected (${forgedWeighing.error.code})` : "insert was ALLOWED");

  const [ownWeighing] = await sql`select id from weighings where factory_id = ${SEED_IDS.factoryA} and collector_id = ${collectorA.id} limit 1`;
  const rewrite = await collector.from("weighings").update({ weight_kg: 999 }).eq("id", ownWeighing.id).select("id");
  check("collector cannot rewrite weighing history", (rewrite.data ?? []).length === 0, `${(rewrite.data ?? []).length} row(s) updated`);

  await sql`
    insert into user_profiles (user_id, factory_id, full_name, national_id_number)
    values (${collectorAUser.id}, ${SEED_IDS.factoryA}, 'Collector A', 'PRIVATE-NIC')
    on conflict (user_id) do update set full_name = excluded.full_name, national_id_number = excluded.national_id_number`;
  const ownProfile = await collector.from("user_profiles").update({ job_title: "Leaf Collector" }).eq("user_id", collectorAUser.id).select("user_id");
  check("collector can update only their own staff profile", (ownProfile.data ?? []).length === 1, ownProfile.error?.message ?? `${(ownProfile.data ?? []).length} row(s)`);

  await sql`
    insert into user_profiles (user_id, factory_id, full_name)
    values (${ownerARow.id}, ${SEED_IDS.factoryA}, 'Owner A')
    on conflict (user_id) do update set full_name = excluded.full_name`;
  const otherProfile = await collector.from("user_profiles").update({ full_name: "Forged owner" }).eq("user_id", ownerARow.id).select("user_id");
  check("collector cannot update another staff profile", (otherProfile.data ?? []).length === 0, `${(otherProfile.data ?? []).length} cross-user row(s) updated`);

  await sql`
    update user_profiles set full_name = 'Shared Collector', national_id_number = 'MUST-NOT-LEAK',
      phone = '0700000000', job_title = 'Leaf Collector', visible_to_colleagues = true
    where user_id = ${collectorAUser.id}`;
  await sql`
    insert into user_profiles (user_id, factory_id, full_name, visible_to_colleagues)
    values (${ownerBRow.id}, ${SEED_IDS.factoryB}, 'Other Factory Owner', true)
    on conflict (user_id) do update set full_name = excluded.full_name, visible_to_colleagues = excluded.visible_to_colleagues`;
  const privateRow = await ownerA.from("user_profiles").select("national_id_number").eq("user_id", collectorAUser.id);
  const directory = await ownerA.rpc("list_visible_staff_profiles");
  const directoryRows = (directory.data ?? []) as { user_id: string }[];
  check("shared profiles do not expose their private base row", (privateRow.data ?? []).length === 0, `${(privateRow.data ?? []).length} private row(s) visible`);
  check("opted-in work profile appears in the safe directory", directoryRows.filter((r) => r.user_id === collectorAUser.id).length === 1, directory.error?.message ?? `${directoryRows.filter((r) => r.user_id === collectorAUser.id).length} directory row(s)`);
  check("staff directory excludes other factories", directoryRows.filter((r) => r.user_id === ownerBRow.id).length === 0, `${directoryRows.filter((r) => r.user_id === ownerBRow.id).length} cross-factory row(s)`);

  const testUsername = `rls_${randomUUID().slice(0, 8)}`;
  const renamed = await collector.rpc("update_own_username", { p_username: testUsername });
  const [stored] = await sql`select username from users where id = ${collectorAUser.id}`;
  check("username RPC updates only the authenticated user", !renamed.error && stored?.username === testUsername, renamed.error?.message ?? `stored=${stored?.username}`);

  const anonymous = await fetch(`${dataBase}/rest/v1/weighings?select=id`);
  const anonymousBody = await anonymous.text();
  check(
    "anonymous request is refused for missing credentials",
    !anonymous.ok && /authentication credentials/i.test(anonymousBody),
    `HTTP ${anonymous.status}`,
  );

  const expectedDeleteRules = new Map<string, string>([
    ["broker_rates_broker_id_brokers_id_fk", "c"],
    ["broker_grade_thresholds_broker_id_brokers_id_fk", "c"],
    ["broker_grade_thresholds_grade_id_auction_grades_id_fk", "c"],
    ["auction_lots_sale_id_auction_sales_id_fk", "c"],
    ["auction_sales_parent_sale_id_fk", "c"],
    ["reprint_source_lot_id_fk", "n"],
    ["valuations_lot_id_auction_lots_id_fk", "c"],
    ["lot_invoices_lot_id_auction_lots_id_fk", "c"],
    ["doc_imports_sale_id_auction_sales_id_fk", "n"],
    ["auction_audit_lot_id_auction_lots_id_fk", "n"],
    ["auction_audit_sale_id_auction_sales_id_fk", "c"],
    ["sale_lines_lot_id_auction_lots_id_fk", "a"],
    ["settlements_sale_id_auction_sales_id_fk", "a"],
    ["vat_ledger_sale_line_id_sale_lines_id_fk", "a"],
    ["collectors_user_id_users_id_fk", "n"],
    ["user_profiles_user_id_users_id_fk", "c"],
    ["supplier_messages_created_by_users_id_fk", "n"],
    ["supplier_requests_decided_by_users_id_fk", "n"],
    ["supplier_requests_handed_by_users_id_fk", "n"],
    ["settlement_charges_settlement_id_settlements_id_fk", "c"],
    ["bank_txns_matched_settlement_id_settlements_id_fk", "n"],
  ]);
  const deleteRules = await sql<{ conname: string; confdeltype: string }[]>`
    select conname, confdeltype from pg_constraint where conname in ${sql([...expectedDeleteRules.keys()])}`;
  const actual = new Map(deleteRules.map((row) => [row.conname, row.confdeltype]));
  for (const [constraint, expected] of expectedDeleteRules) {
    check(`delete rule ${constraint}`, actual.get(constraint) === expected, `expected ${expected}, got ${actual.get(constraint) ?? "missing"}`);
  }

  await sql.end();
  console.log(failures === 0 ? "\nRLS verification (Data API): ALL CHECKS PASSED" : `\nRLS verification (Data API): ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
