import postgres from "postgres";

function parseLooseUrl(raw) {
  const url = raw.replace(/^"|"$/g, "");
  const rest = url.split("://")[1];
  const at = rest.lastIndexOf("@");
  const creds = rest.slice(0, at);
  const [hostPort, database] = rest.slice(at + 1).split("/");
  const [host, port] = hostPort.split(":");
  const colon = creds.indexOf(":");
  return {
    username: creds.slice(0, colon),
    password: creds.slice(colon + 1),
    host,
    port: Number(port || 5432),
    database: (database || "postgres").split("?")[0],
  };
}

let failures = 0;
function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

const source = postgres({ ...parseLooseUrl(process.env.SUPABASE_DATABASE_URL), max: 1, prepare: false, ssl: "require" });
const target = postgres(process.env.NEON_PROD_DATABASE_URL.replace(/^"|"$/g, ""), { max: 1, prepare: false });

const selfRefs = [
  ["auction_sales", "parent_sale_id"],
  ["auction_lots", "reprint_source_lot_id"],
  ["auction_lots", "skipped_source_lot_id"],
];

for (const [table, col] of selfRefs) {
  const q = (db) => db`select count(${db(col)})::int as n from ${db(table)}`;
  const [[{ n: s }], [{ n: t }]] = await Promise.all([q(source), q(target)]);
  check(`${table}.${col} restored`, s === t, `source=${s} target=${t} non-null`);
}

const crossFactory = await target`
  select tc.relname as child, pc.relname as parent, a.attname as col
  from pg_constraint c
  join pg_class tc on tc.oid = c.conrelid
  join pg_class pc on pc.oid = c.confrelid
  join pg_namespace n on n.oid = tc.relnamespace
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  where c.contype = 'f' and n.nspname = 'public'
    and array_length(c.conkey, 1) = 1
    and exists (select 1 from information_schema.columns x
                where x.table_schema = 'public' and x.table_name = tc.relname and x.column_name = 'factory_id')
    and exists (select 1 from information_schema.columns x
                where x.table_schema = 'public' and x.table_name = pc.relname and x.column_name = 'factory_id')`;

let checkedEdges = 0;
let leakingRows = 0;
const leaks = [];
for (const { child, parent, col } of crossFactory) {
  const [{ n }] = await target.unsafe(
    `select count(*)::int as n from public."${child}" c
     join public."${parent}" p on p.id = c."${col}"
     where c.factory_id <> p.factory_id`,
  );
  checkedEdges++;
  if (n > 0) {
    leakingRows += n;
    leaks.push(`${child}.${col}→${parent} (${n})`);
  }
}
check(
  "no row references a parent in another factory",
  leakingRows === 0,
  leakingRows === 0 ? `${checkedEdges} factory-scoped foreign keys checked` : leaks.join(", "),
);

const [authStats] = await target`
  select
    (select count(*)::int from public.users) as app_users,
    (select count(*)::int from neon_auth."user") as auth_users,
    (select count(*)::int from public.users p join neon_auth."user" u on u.id = p.id) as id_matched,
    (select count(*)::int from neon_auth.account where "providerId" = 'credential') as credentials,
    (select count(*)::int from neon_auth.account
       where "providerId" = 'credential' and password ~ '^[0-9a-f]{32}:[0-9a-f]{128}$') as well_formed,
    (select count(*)::int from neon_auth."user" where role = 'admin') as platform_admins`;

check("every app user has an auth account with the same id", authStats.id_matched === authStats.app_users, `${authStats.id_matched}/${authStats.app_users} matched`);
check("no orphan auth accounts", authStats.auth_users === authStats.app_users, `auth=${authStats.auth_users} app=${authStats.app_users}`);
check("every credential hash is Better Auth scrypt", authStats.well_formed === authStats.credentials, `${authStats.well_formed}/${authStats.credentials} well-formed`);
check("nobody holds platform-wide admin", authStats.platform_admins === 0, `${authStats.platform_admins} admin(s)`);

await Promise.all([source.end(), target.end()]);
console.log(failures === 0 ? "\nMigrated data: ALL CHECKS PASSED" : `\nMigrated data: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
