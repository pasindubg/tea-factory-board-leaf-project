/**
 * M1 verification gate: RLS factory isolation.
 *
 * Simulates Supabase auth by setting request.jwt.claims and switching to the
 * `authenticated` / `anon` roles, then checks:
 *   1. Factory A's owner sees only factory A weighings (and same for B)
 *   2. Collector weighing access is tied to the authenticated actor
 *   3. Anonymous sees zero rows
 *
 *   DATABASE_URL=postgres://... pnpm db:verify-rls   (run db:seed first)
 */
import postgres from "postgres";
import { randomUUID } from "node:crypto";
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
    const accessRoles = await tx`select distinct factory_id from access_roles`;
    const factories = await tx`select id from factories`;
    return { weighings, suppliers, accessRoles, factories };
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
  const [collectorAUser] = await sql`select id from users where email = 'collector-a@example.com'`;
  const [collectorA] = collectorAUser
    ? await sql`select id from collectors where user_id = ${collectorAUser.id} and factory_id = ${SEED_IDS.factoryA}`
    : [];
  const [collectorB] = await sql`select id from collectors where factory_id = ${SEED_IDS.factoryB} limit 1`;
  const [supplierA] = await sql`select id from suppliers where factory_id = ${SEED_IDS.factoryA} and active is distinct from false limit 1`;
  if (!collectorAUser || !collectorA || !collectorB || !supplierA) {
    throw new Error("Seed collector/supplier rows not found — run db:seed (and db:link-auth against cloud) first");
  }

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
  check(
    "owner A sees only factory A access roles",
    a.accessRoles.length === 1 && a.accessRoles[0].factory_id === SEED_IDS.factoryA,
    `factory_ids: ${JSON.stringify(a.accessRoles.map((r) => r.factory_id))}`,
  );

  // 2. Factory B owner
  const b = await asUser(ownerB);
  check(
    "owner B sees only factory B weighings",
    b.weighings.length === 1 && b.weighings[0].factory_id === SEED_IDS.factoryB,
    `factory_ids: ${JSON.stringify(b.weighings.map((r) => r.factory_id))}`,
  );

  // 3. Cross-tenant write must be rejected
  let crossWriteAllowed = false;
  await sql
    .begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: ownerA, role: "authenticated" })}, true)`;
      await tx.unsafe(`set local role authenticated`);
      await tx`insert into suppliers (factory_id, name) values (${SEED_IDS.factoryB}, 'Intruder')`;
      crossWriteAllowed = true;
      throw new Error("ROLLBACK_CROSS_TENANT_TEST");
    })
    .catch((error) => {
      if (crossWriteAllowed && (error as Error).message !== "ROLLBACK_CROSS_TENANT_TEST") throw error;
    });
  check(
    "owner A cannot insert a supplier into factory B",
    !crossWriteAllowed,
    crossWriteAllowed ? "insert was ALLOWED" : "insert rejected",
  );

  let crossRoleWriteAllowed = false;
  await sql
    .begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: ownerA, role: "authenticated" })}, true)`;
      await tx.unsafe(`set local role authenticated`);
      await tx`
        insert into access_roles (factory_id, key, name, base_role)
        values (${SEED_IDS.factoryB}, ${`forged-${randomUUID()}`}, 'Forged role', 'manager')
      `;
      crossRoleWriteAllowed = true;
      throw new Error("ROLLBACK_CROSS_ROLE_TEST");
    })
    .catch((error) => {
      if (crossRoleWriteAllowed && (error as Error).message !== "ROLLBACK_CROSS_ROLE_TEST") throw error;
    });
  check(
    "owner A cannot create a role in factory B",
    !crossRoleWriteAllowed,
    crossRoleWriteAllowed ? "insert was ALLOWED" : "insert rejected",
  );

  // 4. The field client writes directly with the authenticated collector JWT.
  // RLS must derive collector identity from auth.uid(), not trust the payload.
  let validCollectorInsert = false;
  await sql
    .begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: collectorAUser.id, role: "authenticated" })}, true)`;
      await tx.unsafe(`set local role authenticated`);
      await tx`
        insert into weighings (id, factory_id, supplier_id, collector_id, weight_kg, collected_at)
        values (${randomUUID()}, ${SEED_IDS.factoryA}, ${supplierA.id}, ${collectorA.id}, 1.00, now())
      `;
      validCollectorInsert = true;
      throw new Error("ROLLBACK_VALID_COLLECTOR_TEST");
    })
    .catch((error) => {
      if ((error as Error).message !== "ROLLBACK_VALID_COLLECTOR_TEST") throw error;
    });
  check("collector can insert a weighing as their linked collector", validCollectorInsert, validCollectorInsert ? "insert allowed" : "insert rejected");

  let forgedCollectorAllowed = false;
  await sql
    .begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: collectorAUser.id, role: "authenticated" })}, true)`;
      await tx.unsafe(`set local role authenticated`);
      await tx`
        insert into weighings (id, factory_id, supplier_id, collector_id, weight_kg, collected_at)
        values (${randomUUID()}, ${SEED_IDS.factoryA}, ${supplierA.id}, ${collectorB.id}, 1.00, now())
      `;
      forgedCollectorAllowed = true;
      throw new Error("ROLLBACK_FORGED_COLLECTOR_TEST");
    })
    .catch((error) => {
      if (forgedCollectorAllowed && (error as Error).message !== "ROLLBACK_FORGED_COLLECTOR_TEST") throw error;
    });
  check(
    "collector cannot forge another collector on a weighing",
    !forgedCollectorAllowed,
    forgedCollectorAllowed ? "insert was ALLOWED" : "insert rejected",
  );

  const [ownWeighing] = await sql`
    select id from weighings
    where factory_id = ${SEED_IDS.factoryA} and collector_id = ${collectorA.id}
    limit 1
  `;
  if (!ownWeighing) throw new Error("Seed weighing for collector A not found — run db:seed first");
  let alteredRowCount = 0;
  await sql
    .begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: collectorAUser.id, role: "authenticated" })}, true)`;
      await tx.unsafe(`set local role authenticated`);
      const alteredRows = await tx`update weighings set weight_kg = 999 where id = ${ownWeighing.id} returning id`;
      alteredRowCount = alteredRows.length;
      throw new Error("ROLLBACK_WEIGHING_UPDATE_TEST");
    })
    .catch((error) => {
      if ((error as Error).message !== "ROLLBACK_WEIGHING_UPDATE_TEST") throw error;
    });
  check("collector cannot rewrite weighing history", alteredRowCount === 0, `${alteredRowCount} row(s) updated`);

  // 5. Self-service staff profiles remain private and tenant-safe.
  let ownProfileUpdated = false;
  await sql
    .begin(async (tx) => {
      await tx`
        insert into user_profiles (user_id, factory_id, full_name, national_id_number)
        values (${collectorAUser.id}, ${SEED_IDS.factoryA}, 'Collector A', 'PRIVATE-NIC')
        on conflict (user_id) do update
          set full_name = excluded.full_name,
              national_id_number = excluded.national_id_number
      `;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: collectorAUser.id, role: "authenticated" })}, true)`;
      await tx.unsafe(`set local role authenticated`);
      const rows = await tx`
        update user_profiles
        set job_title = 'Leaf Collector', updated_at = now()
        where user_id = ${collectorAUser.id}
        returning user_id
      `;
      ownProfileUpdated = rows.length === 1;
      throw new Error("ROLLBACK_OWN_PROFILE_TEST");
    })
    .catch((error) => {
      if ((error as Error).message !== "ROLLBACK_OWN_PROFILE_TEST") throw error;
    });
  check("collector can update only their own staff profile", ownProfileUpdated, ownProfileUpdated ? "own update allowed" : "own update rejected");

  let otherProfileUpdated = false;
  await sql
    .begin(async (tx) => {
      await tx`
        insert into user_profiles (user_id, factory_id, full_name)
        values (${ownerA}, ${SEED_IDS.factoryA}, 'Owner A')
        on conflict (user_id) do update set full_name = excluded.full_name
      `;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: collectorAUser.id, role: "authenticated" })}, true)`;
      await tx.unsafe(`set local role authenticated`);
      const rows = await tx`
        update user_profiles
        set full_name = 'Forged owner'
        where user_id = ${ownerA}
        returning user_id
      `;
      otherProfileUpdated = rows.length > 0;
      throw new Error("ROLLBACK_OTHER_PROFILE_TEST");
    })
    .catch((error) => {
      if ((error as Error).message !== "ROLLBACK_OTHER_PROFILE_TEST") throw error;
    });
  check("collector cannot update another staff profile", !otherProfileUpdated, otherProfileUpdated ? "cross-user update was ALLOWED" : "cross-user update rejected");

  let directVisibleRows = 0;
  let directoryRows = 0;
  let crossFactoryDirectoryRows = 0;
  await sql
    .begin(async (tx) => {
      await tx`
        insert into user_profiles (
          user_id, factory_id, full_name, national_id_number, phone,
          job_title, visible_to_colleagues
        )
        values (
          ${collectorAUser.id}, ${SEED_IDS.factoryA}, 'Shared Collector',
          'MUST-NOT-LEAK', '0700000000', 'Leaf Collector', true
        )
        on conflict (user_id) do update
          set full_name = excluded.full_name,
              national_id_number = excluded.national_id_number,
              phone = excluded.phone,
              job_title = excluded.job_title,
              visible_to_colleagues = excluded.visible_to_colleagues
      `;
      await tx`
        insert into user_profiles (user_id, factory_id, full_name, visible_to_colleagues)
        values (${ownerB}, ${SEED_IDS.factoryB}, 'Other Factory Owner', true)
        on conflict (user_id) do update
          set full_name = excluded.full_name,
              visible_to_colleagues = excluded.visible_to_colleagues
      `;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: ownerA, role: "authenticated" })}, true)`;
      await tx.unsafe(`set local role authenticated`);
      const directRows = await tx`
        select national_id_number
        from user_profiles
        where user_id = ${collectorAUser.id}
      `;
      const sharedRows = await tx`
        select user_id, full_name, phone, job_title
        from public.list_visible_staff_profiles()
        where user_id = ${collectorAUser.id}
      `;
      const otherFactoryRows = await tx`
        select user_id
        from public.list_visible_staff_profiles()
        where user_id = ${ownerB}
      `;
      directVisibleRows = directRows.length;
      directoryRows = sharedRows.length;
      crossFactoryDirectoryRows = otherFactoryRows.length;
      throw new Error("ROLLBACK_PROFILE_VISIBILITY_TEST");
    })
    .catch((error) => {
      if ((error as Error).message !== "ROLLBACK_PROFILE_VISIBILITY_TEST") throw error;
    });
  check("shared profiles do not expose their private base row", directVisibleRows === 0, `${directVisibleRows} private row(s) visible`);
  check("opted-in work profile appears in the safe directory", directoryRows === 1, `${directoryRows} directory row(s) visible`);
  check("staff directory excludes other factories", crossFactoryDirectoryRows === 0, `${crossFactoryDirectoryRows} cross-factory row(s) visible`);

  let ownUsernameUpdated = false;
  await sql
    .begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: collectorAUser.id, role: "authenticated" })}, true)`;
      await tx.unsafe(`set local role authenticated`);
      const testUsername = `rls_${randomUUID().slice(0, 8)}`;
      const [result] = await tx`select public.update_own_username(${testUsername}) as username`;
      const [ownUser] = await tx`select username from users where id = ${collectorAUser.id}`;
      ownUsernameUpdated = result?.username === testUsername && ownUser?.username === testUsername;
      throw new Error("ROLLBACK_USERNAME_TEST");
    })
    .catch((error) => {
      if ((error as Error).message !== "ROLLBACK_USERNAME_TEST") throw error;
    });
  check("username RPC updates only the authenticated user", ownUsernameUpdated, ownUsernameUpdated ? "own username updated" : "username update failed");

  // 6. Anonymous sees nothing
  const anonRows = await sql.begin(async (tx) => {
    await tx.unsafe(`set local role anon`);
    return tx`select * from weighings`;
  });
  check("anonymous sees zero weighings", anonRows.length === 0, `rows: ${anonRows.length}`);

  // 7. Delete semantics are part of the tenant boundary: application code
  // issues one scoped root delete and PostgreSQL must own every relationship.
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
    select conname, confdeltype
    from pg_constraint
    where conname in ${sql([...expectedDeleteRules.keys()])}
  `;
  const actualDeleteRules = new Map(deleteRules.map((row) => [row.conname, row.confdeltype]));
  for (const [constraint, expected] of expectedDeleteRules) {
    const actual = actualDeleteRules.get(constraint);
    check(
      `delete rule ${constraint}`,
      actual === expected,
      `expected ${expected}, got ${actual ?? "missing"}`,
    );
  }

  await sql.end();
  console.log(failures === 0 ? "\nRLS verification: ALL CHECKS PASSED" : `\nRLS verification: ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
