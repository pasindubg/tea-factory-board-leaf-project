/**
 * M1 verification gate: RLS factory isolation.
 *
 * Simulates Supabase auth by setting request.jwt.claims and switching to the
 * `authenticated` / `anon` roles, then checks:
 *   1. Factory A's owner sees only factory A weighings (and same for B)
 *   2. Anonymous sees zero rows
 *
 *   DATABASE_URL=postgres://... pnpm db:verify-rls   (run db:seed first)
 */
import postgres from "postgres";
import { SEED_IDS } from "./seed-ids";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const sql = postgres(url, { max: 1 });

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

async function asUser(userId: string) {
  return sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
    await tx.unsafe(`set local role authenticated`);
    const weighings = await tx`select distinct factory_id from weighings`;
    const suppliers = await tx`select distinct factory_id from suppliers`;
    const factories = await tx`select id from factories`;
    return { weighings, suppliers, factories };
  });
}

async function main() {
  // Resolve the *current* owner ids by email — db:link-auth re-points seed
  // users to their real Supabase auth ids, so fixed SEED_IDS user ids go stale
  // after M2. Factory ids are never re-linked and stay fixed.
  const [ownerARow] = await sql`select id from users where email = 'owner-a@example.com'`;
  const [ownerBRow] = await sql`select id from users where email = 'owner-b@example.com'`;
  if (!ownerARow || !ownerBRow) {
    throw new Error("Seed owners not found — run db:seed (and db:link-auth against cloud) first");
  }
  const ownerA: string = ownerARow.id;
  const ownerB: string = ownerBRow.id;

  // 1. Factory A owner
  const a = await asUser(ownerA);
  check(
    "owner A sees only factory A weighings",
    a.weighings.length === 1 && a.weighings[0].factory_id === SEED_IDS.factoryA,
    `factory_ids: ${JSON.stringify(a.weighings.map((r) => r.factory_id))}`,
  );
  check(
    "owner A sees only factory A suppliers",
    a.suppliers.length === 1 && a.suppliers[0].factory_id === SEED_IDS.factoryA,
    `factory_ids: ${JSON.stringify(a.suppliers.map((r) => r.factory_id))}`,
  );
  check(
    "owner A sees only their own factory row",
    a.factories.length === 1 && a.factories[0].id === SEED_IDS.factoryA,
    `ids: ${JSON.stringify(a.factories.map((r) => r.id))}`,
  );

  // 2. Factory B owner
  const b = await asUser(ownerB);
  check(
    "owner B sees only factory B weighings",
    b.weighings.length === 1 && b.weighings[0].factory_id === SEED_IDS.factoryB,
    `factory_ids: ${JSON.stringify(b.weighings.map((r) => r.factory_id))}`,
  );

  // 3. Cross-tenant write must be rejected
  const crossWrite = await sql
    .begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: ownerA, role: "authenticated" })}, true)`;
      await tx.unsafe(`set local role authenticated`);
      await tx`insert into suppliers (factory_id, name) values (${SEED_IDS.factoryB}, 'Intruder')`;
    })
    .then(() => false)
    .catch(() => true);
  check("owner A cannot insert a supplier into factory B", crossWrite, crossWrite ? "insert rejected" : "insert was ALLOWED");

  // 4. Anonymous sees nothing
  const anonRows = await sql.begin(async (tx) => {
    await tx.unsafe(`set local role anon`);
    return tx`select * from weighings`;
  });
  check("anonymous sees zero weighings", anonRows.length === 0, `rows: ${anonRows.length}`);

  await sql.end();
  console.log(failures === 0 ? "\nRLS verification: ALL CHECKS PASSED" : `\nRLS verification: ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
