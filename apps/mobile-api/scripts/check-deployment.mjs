import { readFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import postgres from "postgres";
import { verifyDeploymentEnv } from "../../web/scripts/verify-deployment-env.mjs";

verifyDeploymentEnv(process.env);

if (process.env.VERCEL_ENV === "production") {
  const journalPath = new URL("../../../packages/db/drizzle/meta/_journal.json", import.meta.url);
  const { entries } = JSON.parse(await readFile(journalPath, "utf8"));
  const required = entries.at(-1);
  const sql = postgres(process.env.NEON_DATABASE_URL, { max: 1, connect_timeout: 5 });
  try {
    const deadline = Date.now() + 300_000;
    for (;;) {
      const [row] = await sql`
        select max(created_at) as latest from drizzle.__drizzle_migrations
      `;
      if (Number(row.latest) >= required.when) break;
      if (Date.now() >= deadline) {
        throw new Error(`Waiting for the ERP deployment to apply ${required.tag}. Retry after the ERP build succeeds.`);
      }
      console.log(`Waiting for the ERP migration ${required.tag}.`);
      await setTimeout(15_000);
    }
  } finally {
    await sql.end();
  }
}
