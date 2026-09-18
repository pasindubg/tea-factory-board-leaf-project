import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { getAccessToken, signInWithPassword, signOut } from "./auth";
import { hashPassword } from "./auth-admin";
import { ownerDb } from "./owner-db";

const JOB_ROLE = "accountant";
const JOB_NAME = "Background jobs (system)";

function credentials(factoryId: string) {
  const secret = process.env.JOBS_TICK_SECRET;
  if (!secret) throw new Error("JOBS_TICK_SECRET must be set for the background job worker");
  return {
    email: `job-runner+${factoryId}@jobs.invalid`,
    password: createHmac("sha256", secret).update(`job-runner:${factoryId}`).digest("base64url"),
  };
}

async function provision(factoryId: string) {
  const { email, password } = credentials(factoryId);
  await ownerDb().begin(async (tx) => {
    const [existing] = await tx`select id from neon_auth."user" where email = ${email}`;
    const id: string = existing?.id ?? randomUUID();

    if (existing) {
      await tx`update neon_auth."user" set banned = false, "banReason" = null, "updatedAt" = now() where id = ${id}`;
    } else {
      await tx`
        insert into neon_auth."user" (id, name, email, "emailVerified", role, banned, "createdAt", "updatedAt")
        values (${id}, ${JOB_NAME}, ${email}, true, 'user', false, now(), now())`;
    }

    await tx`delete from neon_auth.account where "userId" = ${id} and "providerId" = 'credential'`;
    await tx`
      insert into neon_auth.account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
      values (${randomUUID()}, ${id}, 'credential', ${id}, ${hashPassword(password)}, now(), now())`;

    await tx`
      insert into public.users (id, factory_id, name, email, role, active)
      values (${id}, ${factoryId}, ${JOB_NAME}, ${email}, ${JOB_ROLE}, true)
      on conflict (id) do update
        set factory_id = excluded.factory_id, role = excluded.role, active = true`;
  });
}

async function signInForToken(factoryId: string): Promise<string | null> {
  const { email, password } = credentials(factoryId);
  const { error, setCookie } = await signInWithPassword(email, password);
  if (error) return null;

  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  const { token } = await getAccessToken(cookie);
  await signOut(cookie);
  return token;
}

export async function jobRunnerToken(factoryId: string): Promise<string> {
  const first = await signInForToken(factoryId);
  if (first) return first;

  await provision(factoryId);
  const second = await signInForToken(factoryId);
  if (!second) throw new Error("The background job identity for this factory could not sign in.");
  return second;
}

export async function factoryOfUser(userId: string): Promise<string | null> {
  const [row] = await ownerDb()`select factory_id from public.users where id = ${userId}`;
  return (row?.factory_id as string | undefined) ?? null;
}
