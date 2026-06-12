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

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql, { schema });

  await sql`truncate table payments, weighings, lots, price_rates, suppliers, collectors, users, factories cascade`;

  await db.insert(schema.factories).values([
    { id: SEED_IDS.factoryA, name: "Galle Valley Tea Factory", location: "Galle", contactPhone: "0912234567" },
    { id: SEED_IDS.factoryB, name: "Kandy Hills Tea Factory", location: "Kandy", contactPhone: "0812234567" },
  ]);

  await db.insert(schema.users).values([
    { id: SEED_IDS.ownerA, factoryId: SEED_IDS.factoryA, name: "Owner A", email: "owner-a@example.com", role: "owner" },
    { id: SEED_IDS.collectorUserA, factoryId: SEED_IDS.factoryA, name: "Collector A", email: "collector-a@example.com", role: "collector" },
    { id: SEED_IDS.ownerB, factoryId: SEED_IDS.factoryB, name: "Owner B", email: "owner-b@example.com", role: "owner" },
    { id: SEED_IDS.collectorUserB, factoryId: SEED_IDS.factoryB, name: "Collector B", email: "collector-b@example.com", role: "collector" },
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
      { factoryId: SEED_IDS.factoryA, collectorId: colA.id, name: "K. Gunasekara", area: "Akmeemana", landSizeAcres: "2.50" },
      { factoryId: SEED_IDS.factoryA, collectorId: colA.id, name: "W. Silva", area: "Baddegama", landSizeAcres: "1.25" },
      { factoryId: SEED_IDS.factoryA, collectorId: colA.id, name: "P. Fernando", area: "Akmeemana", landSizeAcres: "4.00" },
    ])
    .returning();
  const suppliersB = await db
    .insert(schema.suppliers)
    .values([
      { factoryId: SEED_IDS.factoryB, collectorId: colB.id, name: "R. Dissanayake", area: "Gampola", landSizeAcres: "3.00" },
      { factoryId: SEED_IDS.factoryB, collectorId: colB.id, name: "S. Herath", area: "Nawalapitiya", landSizeAcres: "1.75" },
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
