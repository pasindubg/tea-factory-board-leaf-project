import postgres from "postgres";

const skipped = new Set(["suppliers", "weighings", "payments", "payment_lines", "supplier_adjustments", "supplier_tiers", "supplier_requests", "supplier_messages"]);
const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
function sourceConfig(raw) {
  const rest = raw.replace(/^"|"$/g, "").split("://")[1];
  const at = rest.lastIndexOf("@");
  const creds = rest.slice(0, at);
  const colon = creds.indexOf(":");
  const [hostPort, database] = rest.slice(at + 1).split("/");
  const [host, port] = hostPort.split(":");
  return { username: creds.slice(0, colon), password: host.endsWith('.pooler.supabase.com') ? decodeURIComponent(creds.slice(colon + 1)) : creds.slice(colon + 1), host, port: Number(port || 5432), database: database.split("?")[0], ssl: "require" };
}
const source = postgres({ ...sourceConfig(process.env.SUPABASE_DATABASE_URL), max: 1, prepare: false });
const target = postgres(process.env.NEON_PROD_DATABASE_URL, { max: 1, prepare: false });
let failures = 0;
try {
  await Promise.all([source`set timezone = 'UTC'`, target`set timezone = 'UTC'`]);
  const tables = await source`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`;
  for (const { table_name: table } of tables) {
    const onlyTable = process.argv.find((arg) => arg.startsWith('--table='))?.slice(8);
    if (onlyTable && table !== onlyTable) continue;
    if (skipped.has(table)) { console.log(`EXCLUDED ${table} (intentional customer-book reset)`); continue; }
    const columns = await source`select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = ${table} order by column_name`;
    const targetColumns = await target`select column_name from information_schema.columns where table_schema = 'public' and table_name = ${table}`;
    const available = new Set(targetColumns.map((r) => r.column_name));
    const selected = columns.map((r) => r.column_name).filter((c) => !(table === "users" && c === "supplier_id"));
    if (!selected.every((c) => available.has(c))) { console.log(`FAIL ${table}: missing target columns`); failures++; continue; }
    const sql = `select count(*)::int n, md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text collate "C"), '[]'::jsonb)::text) digest from (select ${selected.map(quote).join(',')} from public.${quote(table)}) t`;
    const [[s], [t]] = await Promise.all([source.unsafe(sql), target.unsafe(sql)]);
    const ok = s.n === t.n && s.digest === t.digest;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${table}: source=${s.n} target=${t.n} content=${s.digest === t.digest ? 'matches' : 'differs'}`);
    if (!ok) failures++;
    if (!ok && process.argv.includes('--details')) {
      const rowsSql = `select to_jsonb(t) as row from (select ${selected.map(quote).join(',')} from public.${quote(table)}) t`;
      const [sr, tr] = await Promise.all([source.unsafe(rowsSql), target.unsafe(rowsSql)]);
      const primaryKey = await source`select a.attname from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = ${'public.' + quote(table)}::regclass and i.indisprimary order by a.attnum`;
      if (!primaryKey.length) throw new Error(`Cannot compare ${table} without a primary key`);
      const key = (row) => JSON.stringify(primaryKey.map(({attname}) => row[attname]));
      const targetRows = new Map(tr.map(({row}) => [key(row), row]));
      const differences = {};
      for (const {row} of sr) {
        const targetRow = targetRows.get(key(row));
        if (!targetRow) { differences['missing-target-primary-key'] = (differences['missing-target-primary-key'] ?? 0) + 1; continue; }
        for (const col of columns) {
          if (!selected.includes(col.column_name)) continue;
          const a = row[col.column_name], b = targetRow[col.column_name];
          if (JSON.stringify(a) === JSON.stringify(b)) continue;
          const kind = col.data_type.startsWith('timestamp')
            ? (Date.parse(a) === Date.parse(b) ? 'timestamp-submillisecond-or-format' : `timestamp-delta-ms=${Date.parse(b) - Date.parse(a)}`) : col.data_type;
          const field = `${col.column_name} (${kind})`;
          differences[field] = (differences[field] ?? 0) + 1;
        }
      }
      console.log('  differing fields:', JSON.stringify(differences));
    }
  }
  const storage = await source`select bucket_id, count(*)::int objects from storage.objects group by bucket_id order by bucket_id`;
  console.log('Source file inventory:', JSON.stringify(storage));
  console.log(failures ? `CUTOVER CHECK: ${failures} mismatch(es)` : 'CUTOVER CHECK: all included table contents match');
} finally {
  await Promise.all([source.end(), target.end()]);
}
process.exitCode = failures ? 1 : 0;
