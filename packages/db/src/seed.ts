/**
 * Dev seed: 2 factories with users, collectors, suppliers, rates, and weighings.
 * Destructive — wipes existing data. Run against dev databases only.
 *
 *   DATABASE_URL=postgres://... pnpm db:seed
 *
 * User IDs are fixed so verify-rls.ts (and later, local auth testing) can
 * reference them. In production these come from Supabase auth.users.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema/index";
import { SEED_IDS } from "./seed-ids";

/** Mirrors ALL_WEB_ROLES + field_officer in apps/web/lib/roles.ts. */
const BUILT_IN_ROLES = [
  { key: "owner", name: "Owner", baseRole: "owner" },
  { key: "manager", name: "Manager", baseRole: "manager" },
  { key: "supervisor", name: "Supervisor", baseRole: "supervisor" },
  { key: "accountant", name: "Accountant", baseRole: "accountant" },
  { key: "collector", name: "Collector", baseRole: "collector" },
  { key: "field_officer", name: "Field officer", baseRole: "field_officer" },
] as const;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // This wipes the factory book. It has already cost a set of hand-configured
  // roles once; refuse anything that is not the local stack.
  const isLocal = /127\.0\.0\.1|localhost/.test(url);
  const allowHost = process.env.SEED_ALLOW_HOST;
  const hostMatches = !!allowHost && new URL(url).hostname === allowHost;
  if (!isLocal && !hostMatches) {
    throw new Error(
      `Refusing to seed ${url.replace(/:\/\/.*@/, "://***@")} — db:seed truncates tenant data. ` +
        `It is for the local stack, or a disposable branch named explicitly via ` +
        `SEED_ALLOW_HOST=${new URL(url).hostname}.`,
    );
  }
  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql, { schema });

  await sql`truncate table payments, weighings, lots, price_rates, suppliers, collectors, users, factories cascade`;

  await db.insert(schema.factories).values([
    { id: SEED_IDS.factoryA, name: "Galle Valley Tea Factory", location: "Galle", contactPhone: "0912234567" },
    { id: SEED_IDS.factoryB, name: "Kandy Hills Tea Factory", location: "Kandy", contactPhone: "0812234567" },
  ]);

  // The truncate above cascades access_roles away, so every factory is re-given
  // the built-in role set. They carry no role_page_permissions rows on purpose:
  // a role with no grants means "not yet configured", and the owner ticks the
  // pages. Seeded users have no access_role_id, so they fall back to their base
  // role's defaults and stay usable regardless.
  await db.insert(schema.accessRoles).values(
    [SEED_IDS.factoryA, SEED_IDS.factoryB].flatMap((factoryId) =>
      BUILT_IN_ROLES.map((role) => ({ factoryId, ...role, systemRole: true })),
    ),
  );

  await db.insert(schema.users).values([
    { id: SEED_IDS.ownerA, factoryId: SEED_IDS.factoryA, name: "Owner A", email: "owner-a@example.com", username: "owner.a", role: "owner" },
    { id: SEED_IDS.collectorUserA, factoryId: SEED_IDS.factoryA, name: "Collector A", email: "collector-a@example.com", username: "collector.a", role: "collector" },
    { id: SEED_IDS.ownerB, factoryId: SEED_IDS.factoryB, name: "Owner B", email: "owner-b@example.com", username: "owner.b", role: "owner" },
    { id: SEED_IDS.collectorUserB, factoryId: SEED_IDS.factoryB, name: "Collector B", email: "collector-b@example.com", username: "collector.b", role: "collector" },
  ]);

  const [colA] = await db
    .insert(schema.collectors)
    .values({ factoryId: SEED_IDS.factoryA, userId: SEED_IDS.collectorUserA, name: "Sunil Perera", area: "Akmeemana" })
    .returning();
  const [colB] = await db
    .insert(schema.collectors)
    .values({ factoryId: SEED_IDS.factoryB, userId: SEED_IDS.collectorUserB, name: "Nimal Bandara", area: "Gampola" })
    .returning();

  const suppliersA = await db
    .insert(schema.suppliers)
    .values([
      { factoryId: SEED_IDS.factoryA, collectorId: colA.id, customerNo: "0001", name: "K. Gunasekara", phone: "0771000001", area: "Akmeemana", landSizeAcres: "2.50", latitude: "6.0367000", longitude: "80.2170000" },
      { factoryId: SEED_IDS.factoryA, collectorId: colA.id, customerNo: "0002", name: "W. Silva", phone: "0771000002", area: "Baddegama", landSizeAcres: "1.25", latitude: "6.1750000", longitude: "80.1830000" },
      { factoryId: SEED_IDS.factoryA, collectorId: colA.id, customerNo: "0003", name: "P. Fernando", phone: "0771000003", area: "Akmeemana", landSizeAcres: "4.00", latitude: "6.0420000", longitude: "80.2240000" },
    ])
    .returning();
  const suppliersB = await db
    .insert(schema.suppliers)
    .values([
      { factoryId: SEED_IDS.factoryB, collectorId: colB.id, customerNo: "0001", name: "R. Dissanayake", phone: "0772000001", area: "Gampola", landSizeAcres: "3.00", latitude: "7.1640000", longitude: "80.5680000" },
      { factoryId: SEED_IDS.factoryB, collectorId: colB.id, customerNo: "0002", name: "S. Herath", phone: "0772000002", area: "Nawalapitiya", landSizeAcres: "1.75", latitude: "7.0540000", longitude: "80.5340000" },
    ])
    .returning();

  await db.insert(schema.priceRates).values([
    { factoryId: SEED_IDS.factoryA, grade: "GREEN_LEAF", pricePerKg: "95.00", effectiveFrom: "2026-06-01" },
    { factoryId: SEED_IDS.factoryB, grade: "GREEN_LEAF", pricePerKg: "92.50", effectiveFrom: "2026-06-01" },
  ]);

  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const weighing = (factoryId: string, collectorId: string, supplierId: string, weightKg: string, collectedAt: Date) => ({
    id: crypto.randomUUID(),
    factoryId,
    collectorId,
    supplierId,
    weightKg,
    collectedAt,
    syncedAt: new Date(),
  });

  await db.insert(schema.weighings).values([
    weighing(SEED_IDS.factoryA, colA.id, suppliersA[0].id, "42.50", yesterday),
    weighing(SEED_IDS.factoryA, colA.id, suppliersA[1].id, "18.75", yesterday),
    weighing(SEED_IDS.factoryA, colA.id, suppliersA[0].id, "39.00", today),
    weighing(SEED_IDS.factoryA, colA.id, suppliersA[2].id, "61.20", today),
    weighing(SEED_IDS.factoryB, colB.id, suppliersB[0].id, "55.00", yesterday),
    weighing(SEED_IDS.factoryB, colB.id, suppliersB[1].id, "27.30", today),
  ]);

  const counts = await sql`
    select
      (select count(*) from factories) as factories,
      (select count(*) from users) as users,
      (select count(*) from suppliers) as suppliers,
      (select count(*) from weighings) as weighings`;
  console.log("Seeded:", counts[0]);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
