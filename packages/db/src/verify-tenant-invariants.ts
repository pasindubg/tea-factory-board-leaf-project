import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const sql = postgres(url, { max: 1, prepare: false });

const INTENTIONAL_OMISSIONS: Record<string, { cmds: string[]; why: string }> = {
  weighings: {
    cmds: ["UPDATE", "DELETE"],
    why: "Intake is an immutable audit trail; corrections are new rows, never edits.",
  },
  user_devices: {
    cmds: ["INSERT", "DELETE"],
    why: "Devices are claimed through register_device() and retired with revoked_at.",
  },
  user_profiles: {
    cmds: ["DELETE"],
    why: "Removed by cascade from users, never directly.",
  },
};

let failures = 0;
function fail(table: string, problem: string) {
  console.log(`FAIL  ${table} — ${problem}`);
  failures++;
}

type Row = {
  relname: string;
  rls_enabled: boolean;
  fid_nullable: boolean;
  cmds: string[];
  unscoped_policies: string[];
};

async function main() {
  const rows = (await sql`
    WITH factory_scoped AS (
      SELECT c.oid, c.relname, c.relrowsecurity AS rls_enabled
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND EXISTS (
          SELECT 1 FROM information_schema.columns col
          WHERE col.table_schema = 'public'
            AND col.table_name = c.relname
            AND col.column_name = 'factory_id'
        )
    )
    SELECT
      f.relname,
      f.rls_enabled,
      EXISTS (
        SELECT 1 FROM information_schema.columns col
        WHERE col.table_schema = 'public' AND col.table_name = f.relname
          AND col.column_name = 'factory_id' AND col.is_nullable = 'YES'
      ) AS fid_nullable,
      coalesce(array_agg(DISTINCT p.cmd) FILTER (WHERE p.cmd IS NOT NULL), '{}') AS cmds,
      coalesce(array_agg(p.policyname) FILTER (
        WHERE p.policyname IS NOT NULL
          AND p.permissive = 'PERMISSIVE'
          AND coalesce(p.qual, '') || coalesce(p.with_check, '') NOT LIKE '%factory_id%'
      ), '{}') AS unscoped_policies
    FROM factory_scoped f
    LEFT JOIN pg_policies p
      ON p.schemaname = 'public' AND p.tablename = f.relname
    GROUP BY f.relname, f.rls_enabled
    ORDER BY f.relname
  `) as unknown as Row[];

  if (rows.length === 0) throw new Error("No factory-scoped tables found — wrong database?");

  for (const t of rows) {
    if (!t.rls_enabled) fail(t.relname, "RLS is not enabled");
    if (t.fid_nullable) {
      fail(t.relname, "factory_id is nullable — a NULL belongs to no factory and matches no policy");
    }

    const allowed = INTENTIONAL_OMISSIONS[t.relname]?.cmds ?? [];
    for (const cmd of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      const covered = t.cmds.includes(cmd) || t.cmds.includes("ALL");
      if (!covered && !allowed.includes(cmd)) {
        fail(t.relname, `no ${cmd} policy, and it is not a declared omission`);
      }
    }

    for (const name of t.unscoped_policies) {
      fail(t.relname, `policy "${name}" does not reference factory_id`);
    }
  }

  for (const [table, { cmds }] of Object.entries(INTENTIONAL_OMISSIONS)) {
    const row = rows.find((r) => r.relname === table);
    if (!row) {
      fail(table, "declared in INTENTIONAL_OMISSIONS but no longer a factory-scoped table");
      continue;
    }
    for (const cmd of cmds) {
      if (row.cmds.includes(cmd) || row.cmds.includes("ALL")) {
        fail(table, `${cmd} is declared as an intentional omission but a policy now exists`);
      }
    }
  }

  const [{ neon }] = await sql`SELECT to_regprocedure('public.request_uid()') IS NOT NULL AS neon`;
  if (neon) {
    const stale = await sql`
      SELECT 'function ' || p.proname AS what
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosrc LIKE '%auth.uid()%'
      UNION ALL
      SELECT 'policy ' || tablename || '.' || policyname
      FROM pg_policies
      WHERE coalesce(qual, '') || coalesce(with_check, '') LIKE '%auth.uid()%'
    `;
    for (const { what } of stale) {
      fail(what, "calls auth.uid() — re-run packages/db/neon/003_request_identity.sql");
    }
  }

  console.log(
    `\nChecked ${rows.length} factory-scoped tables ` +
      `(${Object.keys(INTENTIONAL_OMISSIONS).length} with declared omissions).`,
  );
  if (failures > 0) {
    console.error(`Tenant invariants: ${failures} FAILURE(S)`);
    await sql.end();
    process.exit(1);
  }
  console.log("Tenant invariants: ALL CHECKS PASSED");
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
