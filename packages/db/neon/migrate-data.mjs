import postgres from "postgres";
import { randomBytes, scryptSync } from "node:crypto";
import { writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const APPLY = process.argv.includes("--apply");
const EXPECTED_TARGET_ENDPOINT = "ep-sweet-river-azg84cej";

const SKIP = new Set([
  "suppliers",
  "weighings",
  "payments",
  "payment_lines",
  "supplier_adjustments",
  "supplier_tiers",
  "supplier_requests",
  "supplier_messages",
]);

const NULL_OUT = { users: ["supplier_id"] };

function parseLooseUrl(raw) {
  const url = raw.replace(/^"|"$/g, "");
  const [scheme, rest] = url.split("://");
  const at = rest.lastIndexOf("@");
  const creds = rest.slice(0, at);
  const hostPart = rest.slice(at + 1);
  const colon = creds.indexOf(":");
  const [hostPort, database] = hostPart.split("/");
  const [host, port] = hostPort.split(":");
  return {
    scheme,
    username: creds.slice(0, colon),
    password: creds.slice(colon + 1),
    host,
    port: Number(port || 5432),
    database: (database || "postgres").split("?")[0],
  };
}

function betterAuthHash(password) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password.normalize("NFKC"), salt, 64, {
    N: 16384,
    r: 16,
    p: 1,
    maxmem: 128 * 16384 * 16 * 2,
  });
  return `${salt}:${key.toString("hex")}`;
}

function tempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(18);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function topoOrder(tables, edges) {
  const incoming = new Map(tables.map((t) => [t, new Set()]));
  for (const { child, parent } of edges) {
    if (child !== parent && incoming.has(child) && incoming.has(parent)) {
      incoming.get(child).add(parent);
    }
  }
  const order = [];
  const ready = tables.filter((t) => incoming.get(t).size === 0).sort();
  while (ready.length) {
    const t = ready.shift();
    order.push(t);
    for (const [child, parents] of incoming) {
      if (parents.delete(t) && parents.size === 0) ready.push(child);
    }
  }
  if (order.length !== tables.length) {
    const stuck = tables.filter((t) => !order.includes(t));
    throw new Error(`Foreign-key cycle between: ${stuck.join(", ")}`);
  }
  return order;
}

async function main() {
  if (!process.env.SUPABASE_DATABASE_URL) throw new Error("SUPABASE_DATABASE_URL is not set");
  if (!process.env.NEON_PROD_DATABASE_URL) throw new Error("NEON_PROD_DATABASE_URL is not set");

  const targetUrl = process.env.NEON_PROD_DATABASE_URL.replace(/^"|"$/g, "");
  if (!targetUrl.includes(EXPECTED_TARGET_ENDPOINT)) {
    throw new Error(`Refusing: target is not the Neon production endpoint ${EXPECTED_TARGET_ENDPOINT}.`);
  }

  const src = parseLooseUrl(process.env.SUPABASE_DATABASE_URL);
  // Preserve PostgreSQL date/time text exactly: JS Date loses microseconds and
  // interprets timestamp-without-time-zone in the machine's local timezone.
  const types = {
    date: { to: 1082, from: [1082], serialize: String, parse: String },
    timestamp: { to: 1114, from: [1114], serialize: String, parse: String },
    timestamptz: { to: 1184, from: [1184], serialize: String, parse: String },
  };
  const source = postgres({ ...src, max: 1, prepare: false, ssl: "require", types });
  const target = postgres(targetUrl, { max: 1, prepare: false, types });

  console.log(`mode: ${APPLY ? "APPLY" : "dry run"}`);
  console.log(`source: ${src.host}`);
  console.log(`target: ${new URL(targetUrl).hostname}\n`);

  const targetTables = (
    await target`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'`
  ).map((r) => r.table_name);

  const sourceTables = new Set(
    (
      await source`
        select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'`
    ).map((r) => r.table_name),
  );

  const edges = await target`
    select tc.relname as child, pc.relname as parent
    from pg_constraint c
    join pg_class tc on tc.oid = c.conrelid
    join pg_class pc on pc.oid = c.confrelid
    join pg_namespace n on n.oid = tc.relnamespace
    where c.contype = 'f' and n.nspname = 'public'`;

  const selfRefs = {};
  for (const r of await target`
    select tc.relname as t, a.attname as col
    from pg_constraint c
    join pg_class tc on tc.oid = c.conrelid
    join pg_namespace n on n.oid = tc.relnamespace
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f' and n.nspname = 'public' and c.conrelid = c.confrelid`) {
    (selfRefs[r.t] ??= []).push(r.col);
  }

  const copyable = targetTables.filter((t) => !SKIP.has(t) && sourceTables.has(t));
  const order = topoOrder(copyable, edges);
  const onlyOnTarget = targetTables.filter((t) => !sourceTables.has(t));

  const plan = [];
  for (const table of order) {
    const [srcCols, tgtCols] = await Promise.all([
      source`select column_name from information_schema.columns
             where table_schema = 'public' and table_name = ${table}`,
      target`select column_name from information_schema.columns
             where table_schema = 'public' and table_name = ${table}
               and is_generated = 'NEVER'
               and coalesce(identity_generation, '') <> 'ALWAYS'`,
    ]);
    const tgtSet = new Set(tgtCols.map((c) => c.column_name));
    const cols = srcCols.map((c) => c.column_name).filter((c) => tgtSet.has(c));
    const [{ n }] = await source`select count(*)::int as n from ${source(table)}`;
    plan.push({ table, cols, rows: n });
  }

  const skippedCounts = [];
  for (const t of SKIP) {
    if (!sourceTables.has(t)) continue;
    const [{ n }] = await source`select count(*)::int as n from ${source(t)}`;
    skippedCounts.push(`${t}=${n}`);
  }

  console.log("copy order (FK dependencies first):");
  for (const p of plan) {
    const extra = [
      selfRefs[p.table] ? `self-ref: ${selfRefs[p.table].join(",")}` : null,
      NULL_OUT[p.table] ? `nulled: ${NULL_OUT[p.table].join(",")}` : null,
    ].filter(Boolean);
    console.log(`  ${p.table.padEnd(38)} ${String(p.rows).padStart(5)} rows${extra.length ? "  [" + extra.join("; ") + "]" : ""}`);
  }
  console.log(`\nskipped (customer book, per 0067): ${skippedCounts.join(", ") || "none"}`);
  console.log(`only on target, left empty: ${onlyOnTarget.join(", ") || "none"}`);

  if (!APPLY) {
    console.log("\nDry run complete. Nothing written. Re-run with --apply.");
    await Promise.all([source.end(), target.end()]);
    return;
  }

  const credentials = [];

  await target.begin(async (tx) => {
    await tx.unsafe(
      `truncate table ${targetTables.map((t) => `public."${t}"`).join(", ")} restart identity cascade`,
    );

    for (const { table, cols } of plan) {
      if (cols.length === 0) continue;
      const rows = await source`select ${source(cols)} from ${source(table)}`;
      if (rows.length === 0) continue;

      const deferred = [...(selfRefs[table] ?? [])];
      const nulled = NULL_OUT[table] ?? [];
      for (const row of rows) {
        for (const c of [...deferred, ...nulled]) if (c in row) row[c] = null;
      }
      for (let i = 0; i < rows.length; i += 500) {
        await tx`insert into ${tx(table)} ${tx(rows.slice(i, i + 500), cols)}`;
      }
    }

    for (const [table, columns] of Object.entries(selfRefs)) {
      if (!order.includes(table)) continue;
      const rows = await source`select id, ${source(columns)} from ${source(table)}`;
      for (const row of rows) {
        const set = Object.fromEntries(columns.map((c) => [c, row[c]]));
        if (Object.values(set).every((v) => v === null)) continue;
        await tx`update ${tx(table)} set ${tx(set, columns)} where id = ${row.id}`;
      }
    }

    const appUsers = await tx`select id, email, name, username from public.users`;
    const keep = appUsers.map((u) => u.id);
    await tx`delete from neon_auth.session where "userId" <> all(${keep}::uuid[])`;
    await tx`delete from neon_auth.account where "userId" <> all(${keep}::uuid[])`;
    await tx`delete from neon_auth."user" where id <> all(${keep}::uuid[])`;

    for (const u of appUsers) {
      if (!u.email) continue;
      const password = tempPassword();
      await tx`
        insert into neon_auth."user" (id, name, email, "emailVerified", role, banned, "createdAt", "updatedAt")
        values (${u.id}, ${u.name ?? u.username ?? u.email}, ${u.email}, true, 'user', false, now(), now())
        on conflict (id) do update set email = excluded.email, name = excluded.name, role = 'user'`;
      await tx`delete from neon_auth.account where "userId" = ${u.id} and "providerId" = 'credential'`;
      await tx`
        insert into neon_auth.account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
        values (gen_random_uuid(), ${u.id}, 'credential', ${u.id}, ${betterAuthHash(password)}, now(), now())`;
      credentials.push({ username: u.username ?? "", email: u.email, password });
    }
  });

  console.log("\nverifying row counts:");
  let mismatches = 0;
  for (const { table } of plan) {
    const [[{ s }], [{ t }]] = await Promise.all([
      source`select count(*)::int as s from ${source(table)}`,
      target`select count(*)::int as t from ${target(table)}`,
    ]);
    const ok = s === t;
    if (!ok) mismatches++;
    if (!ok || s > 0) console.log(`  ${ok ? "OK  " : "DIFF"} ${table.padEnd(38)} source=${s} target=${t}`);
  }

  const file = join(homedir(), "tea-neon-temp-passwords.txt");
  writeFileSync(
    file,
    "Temporary passwords for the Neon cutover. Hand each to its owner, then delete this file.\n\n" +
      credentials.map((c) => `${c.username.padEnd(20)} ${c.email.padEnd(40)} ${c.password}`).join("\n") +
      "\n",
  );
  chmodSync(file, 0o600);

  console.log(`\nauth users created with original ids: ${credentials.length}`);
  console.log(`temporary passwords written to ${file} (owner read-only)`);
  console.log(mismatches === 0 ? "\nMIGRATION COMPLETE: all counts match" : `\nMIGRATION FINISHED WITH ${mismatches} COUNT MISMATCH(ES)`);

  await Promise.all([source.end(), target.end()]);
  process.exit(mismatches === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
