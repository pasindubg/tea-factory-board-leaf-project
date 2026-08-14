/**
 * Applies pending Drizzle migrations.
 *
 * This replaces `drizzle-kit migrate`, which prints a spinner and nothing
 * else: when a migration fails it exits 1 having written no error at all, so
 * a failed production deploy gave no cause to act on. The migrator underneath
 * is the same one drizzle-kit calls, reading the same drizzle/ folder and
 * journal and recording into the same drizzle.__drizzle_migrations table — the
 * only difference is that the Postgres error reaches the log.
 *
 *   DATABASE_URL=postgres://... pnpm db:migrate
 */
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

// prepare:false so this works through Supabase's pooler in either mode.
const sql = postgres(url, { max: 1, prepare: false });

const journal = JSON.parse(
  readFileSync("./drizzle/meta/_journal.json", "utf8"),
) as { entries: { tag: string }[] };

// Which migrations are already recorded. The table is absent on a first run.
let applied = 0;
try {
  const [row] = await sql`select count(*)::int as n from drizzle.__drizzle_migrations`;
  applied = row.n;
} catch {
  console.log("No drizzle.__drizzle_migrations table yet — first run.");
}

const pending = journal.entries.slice(applied).map((e) => e.tag);
console.log(`${applied} migration(s) applied, ${pending.length} pending.`);
for (const tag of pending) console.log(`  pending: ${tag}`);

try {
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  console.log(`Migrations applied (${pending.length} new).`);
} catch (err) {
  // drizzle wraps the driver error, and postgres.js hangs the useful parts
  // (which constraint, which table, where in the statement) off the error
  // object rather than putting them in the message.
  console.error("\nMIGRATION FAILED\n");
  for (const e of [err, (err as { cause?: unknown }).cause]) {
    if (!e) continue;
    console.error(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    for (const [key, value] of Object.entries(e as Record<string, unknown>)) {
      if (key !== "stack" && value != null) console.error(`  ${key}: ${String(value)}`);
    }
  }
  console.error(
    `\nThe failing migration is one of: ${pending.join(", ") || "(none pending)"}`,
  );
  await sql.end();
  process.exit(1);
}

await sql.end();
