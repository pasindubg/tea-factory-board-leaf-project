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
) as { entries: { tag: string; when: number }[] };

// drizzle selects migrations by timestamp, not by position: it applies every
// journal entry whose `when` is greater than the newest created_at recorded in
// __drizzle_migrations, and reads that ceiling once, before the loop. So an
// entry timestamped below one that precedes it can never be selected — it is
// skipped in silence, forever. That is how 0040 was passed over on production
// while 0041 onwards applied, leaving 0044 to fail on a table 0040 was
// supposed to create. Refuse to run rather than let it happen again.
for (let i = 1; i < journal.entries.length; i++) {
  const prev = journal.entries[i - 1];
  const curr = journal.entries[i];
  if (curr.when <= prev.when) {
    throw new Error(
      `Journal out of order: ${curr.tag} (when=${curr.when}) is not after ` +
        `${prev.tag} (when=${prev.when}), so drizzle will silently skip it. ` +
        `Raise ${curr.tag}'s "when" in drizzle/meta/_journal.json above ${prev.when}.`,
    );
  }
}

// The same cut drizzle makes, so what is reported is what will actually run.
// A count of recorded rows would not be the same thing and would mislead.
let lastApplied = -1;
try {
  const [row] = await sql`
    select coalesce(max(created_at), -1)::bigint as last
    from drizzle.__drizzle_migrations`;
  lastApplied = Number(row.last);
} catch {
  console.log("No drizzle.__drizzle_migrations table yet — first run.");
}

const pending = journal.entries.filter((e) => e.when > lastApplied);
console.log(
  `Newest applied migration timestamp: ${lastApplied}. ${pending.length} pending.`,
);
for (const e of pending) console.log(`  pending: ${e.tag} (when=${e.when})`);

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
    `\nThe failing migration is one of: ${
      pending.map((e) => e.tag).join(", ") || "(none pending)"
    }`,
  );
  await sql.end();
  process.exit(1);
}

await sql.end();
