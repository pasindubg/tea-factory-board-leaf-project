import postgres from "postgres";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";

const AUTH = process.env.NEON_AUTH_BASE_URL;
const ORIGIN = "http://localhost:3000";
const sql = postgres(process.env.NEON_DATABASE_URL.replace(/^"|"$/g, ""), { max: 1, prepare: false });

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
};

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password.normalize("NFKC"), salt, 64, { N: 16384, r: 16, p: 1, maxmem: 128 * 16384 * 16 * 2 });
  return `${salt}:${key.toString("hex")}`;
}

async function signIn(email, password) {
  const r = await fetch(`${AUTH}/sign-in/email`, {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, code: body?.code };
}

const id = randomUUID();
const email = `auth-admin-probe-${Date.now()}@example.invalid`;
const first = "First-Pass-" + randomBytes(6).toString("hex") + "!A1";
const second = "Second-Pass-" + randomBytes(6).toString("hex") + "!B2";

try {
  await sql.begin(async (tx) => {
    await tx`insert into neon_auth."user" (id, name, email, "emailVerified", role, banned, "createdAt", "updatedAt")
             values (${id}, 'auth admin probe', ${email}, true, 'user', false, now(), now())`;
    await tx`insert into neon_auth.account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
             values (${randomUUID()}, ${id}, 'credential', ${id}, ${hashPassword(first)}, now(), now())`;
  });

  const created = await signIn(email, first);
  check("createAuthUser: new account can sign in", created.ok, `status ${created.status}`);

  await sql`update neon_auth."user" set banned = true, "banReason" = 'probe', "updatedAt" = now() where id = ${id}`;
  await sql`delete from neon_auth.session where "userId" = ${id}`;
  const banned = await signIn(email, first);
  check("setAuthBanned(true): sign-in refused", !banned.ok, `status ${banned.status}${banned.code ? " " + banned.code : ""}`);

  const [{ n: sessionsAfterBan }] = await sql`select count(*)::int as n from neon_auth.session where "userId" = ${id}`;
  check("setAuthBanned(true): no live sessions remain", sessionsAfterBan === 0, `${sessionsAfterBan} session(s)`);

  await sql`update neon_auth."user" set banned = false, "banReason" = null, "updatedAt" = now() where id = ${id}`;
  const unbanned = await signIn(email, first);
  check("setAuthBanned(false): sign-in works again", unbanned.ok, `status ${unbanned.status}`);

  await sql.begin(async (tx) => {
    await tx`update neon_auth.account set password = ${hashPassword(second)}, "updatedAt" = now()
             where "userId" = ${id} and "providerId" = 'credential'`;
    await tx`delete from neon_auth.session where "userId" = ${id}`;
  });
  const oldPw = await signIn(email, first);
  const newPw = await signIn(email, second);
  check("setAuthPassword: old password refused", !oldPw.ok, `status ${oldPw.status}`);
  check("setAuthPassword: new password accepted", newPw.ok, `status ${newPw.status}`);

  await sql.begin(async (tx) => {
    await tx`delete from neon_auth.session where "userId" = ${id}`;
    await tx`delete from neon_auth.account where "userId" = ${id}`;
    await tx`delete from neon_auth."user" where id = ${id}`;
  });
  const deleted = await signIn(email, second);
  check("deleteAuthUser: sign-in refused", !deleted.ok, `status ${deleted.status}`);
} finally {
  await sql`delete from neon_auth.session where "userId" = ${id}`;
  await sql`delete from neon_auth.account where "userId" = ${id}`;
  await sql`delete from neon_auth."user" where id = ${id}`;
  await sql.end();
}

console.log(failures === 0 ? "\nAuth admin: ALL CHECKS PASSED" : `\nAuth admin: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
