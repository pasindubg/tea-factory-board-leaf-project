// Narrow, compare-and-swap repair. Never truncates, inserts, deletes, or changes
// permissions/business fields. Default is read-only; --apply requires host pinning.
import postgres from "postgres";
import { isDeepStrictEqual } from "node:util";

const raw = process.env.SUPABASE_DATABASE_URL?.replace(/^"|"$/g, "");
if (!raw || !process.env.NEON_REPAIR_DATABASE_URL) throw new Error("Source and repair database URLs are required");
const rest = raw.split("://")[1], at = rest.lastIndexOf("@"), credentials = rest.slice(0, at), colon = credentials.indexOf(":");
const [hostPort, db] = rest.slice(at + 1).split("/"), [host, port] = hostPort.split(":");
const targetUrl = new URL(process.env.NEON_REPAIR_DATABASE_URL);
if (targetUrl.hostname !== process.env.REPAIR_ALLOW_HOST || !targetUrl.hostname.endsWith(".neon.tech")) throw new Error("Repair target must be explicitly pinned with REPAIR_ALLOW_HOST");
const pooler = host === "aws-1-ap-south-1.pooler.supabase.com" && credentials.slice(0, colon) === "postgres.mjptydjrsezqvbrlwooz";
if (host !== "db.mjptydjrsezqvbrlwooz.supabase.co" && !pooler) throw new Error("Unexpected source host");
const source = postgres({ host, port: Number(port || 5432), database: db.split("?")[0], username: credentials.slice(0, colon), password: pooler ? decodeURIComponent(credentials.slice(colon + 1)) : credentials.slice(colon + 1), ssl: "require", max: 1, prepare: false });
const target = postgres(process.env.NEON_REPAIR_DATABASE_URL, { max: 1, prepare: false });
const excluded = new Set(["suppliers", "weighings", "payments", "payment_lines", "supplier_adjustments", "supplier_tiers", "supplier_requests", "supplier_messages"]);
const q = (s) => '"' + s.replaceAll('"', '""') + '"';
const apply = process.argv.includes("--apply"), rollback = process.argv.includes("--rollback");
const plans = [];

try {
  await Promise.all([source`set timezone = 'UTC'`, target`set timezone = 'UTC'`]);
  const tables = await source`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`;
  for (const { table_name: table } of tables) {
    if (excluded.has(table)) continue;
    const columns = await source`select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = ${table}`;
    const pk = (await source`select a.attname from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey) where i.indrelid=${'public.' + q(table)}::regclass and i.indisprimary order by a.attnum`).map((r) => r.attname);
    if (!pk.length) throw new Error(`No primary key: ${table}`);
    const [src, dst] = await Promise.all([source.unsafe(`select to_jsonb(t) row from public.${q(table)} t`), target.unsafe(`select to_jsonb(t) row from public.${q(table)} t`)]);
    if (src.length !== dst.length) throw new Error(`Row count changed: ${table}`);
    const key = (row) => JSON.stringify(pk.map((p) => row[p]));
    const lookup = new Map(dst.map(({row}) => [key(row), row]));
    const changes = [], fields = new Set();
    for (const { row } of src) {
      const old = lookup.get(key(row));
      if (!old) throw new Error(`Primary keys differ: ${table}`);
      let changed = false;
      for (const { column_name: name, data_type: type } of columns) {
        if (table === "users" && name === "supplier_id") continue;
        if (isDeepStrictEqual(row[name], old[name])) continue;
        const delta = Date.parse(old[name]) - Date.parse(row[name]);
        if (!type.startsWith("timestamp") || row[name] == null || old[name] == null || ![0, -19800000].includes(delta)) {
          throw new Error(`Unexpected difference at ${table}.${name}; refusing repair`);
        }
        fields.add(name); changed = true;
      }
      if (changed) changes.push({ desired: row, old });
    }
    if (changes.length) {
      plans.push({table, pk, fields: [...fields], changes});
      console.log(`PLAN ${table}: ${changes.length} rows; fields=${[...fields].join(',')}`);
    }
  }
  console.log(`Plan: ${plans.length} tables, ${plans.reduce((n,p) => n+p.changes.length,0)} rows`);
  if (apply || rollback) {
    const rolledBack = new Error("VERIFIED_ROLLBACK");
    try {
      await target.begin(async (tx) => {
        await tx`set local lock_timeout = '5s'`;
        await tx`set local statement_timeout = '30s'`;
        for (const {table, pk, fields, changes} of plans) {
          // postgres.js serializes jsonb parameters; do not double-encode them.
          const desired = changes.map((c) => c.desired);
          const old = changes.map((c) => c.old);
          const join = pk.map((p) => `t.${q(p)} = r.${q(p)}`).join(' and ');
          const oldJoin = pk.map((p) => `o.row->${"'"+p.replaceAll("'","''")+"'"} = to_jsonb(t.${q(p)})`).join(' and ');
          const result = await tx.unsafe(`update public.${q(table)} t set ${fields.map((f) => `${q(f)}=r.${q(f)}`).join(',')} from jsonb_populate_recordset(null::public.${q(table)}, $1::jsonb) r, jsonb_array_elements($2::jsonb) o(row) where ${join} and ${oldJoin} and to_jsonb(t)=o.row returning to_jsonb(t) row`, [desired, old]);
          if (result.length !== changes.length) throw new Error(`Concurrent change detected: ${table}; rolling back`);
          const wanted = new Map(changes.map((c) => [JSON.stringify(pk.map((p) => c.desired[p])), { ...c.old, ...Object.fromEntries(fields.map((f) => [f,c.desired[f]])) }]));
          for (const {row} of result) {
            if (!isDeepStrictEqual(row, wanted.get(JSON.stringify(pk.map((p) => row[p]))))) throw new Error(`Unexpected trigger/field change: ${table}; rolling back`);
          }
          console.log(`VERIFIED ${table}: ${result.length} rows; only planned timestamps changed`);
        }
        if (rollback) throw rolledBack;
      });
    } catch (error) { if (error !== rolledBack) throw error; }
    console.log(rollback ? "Verified transaction rolled back; no persistent data changes." : "Timestamp repair committed atomically.");
  } else console.log("Read-only plan; no data changed.");
} finally { await Promise.all([source.end(), target.end()]); }
