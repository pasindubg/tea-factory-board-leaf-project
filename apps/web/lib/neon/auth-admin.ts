import "server-only";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { ownerDb } from "./owner-db";

type Result = { error: string | null; code?: string };

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password.normalize("NFKC"), salt, 64, {
    N: 16384,
    r: 16,
    p: 1,
    maxmem: 128 * 16384 * 16 * 2,
  });
  return `${salt}:${key.toString("hex")}`;
}

export async function createAuthUser(input: {
  email: string;
  name: string;
  password: string | null;
}): Promise<{ id: string | null; error: string | null; code?: string }> {
  const id = randomUUID();
  try {
    await ownerDb().begin(async (tx) => {
      await tx`
        insert into neon_auth."user" (id, name, email, "emailVerified", role, banned, "createdAt", "updatedAt")
        values (${id}, ${input.name}, ${input.email}, true, 'user', false, now(), now())`;
      if (input.password) {
        await tx`
          insert into neon_auth.account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
          values (${randomUUID()}, ${id}, 'credential', ${id}, ${hashPassword(input.password)}, now(), now())`;
      }
    });
    return { id, error: null };
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      return { id: null, error: "An account with this email already exists.", code: "email_exists" };
    }
    return { id: null, error: `Could not create the login: ${(err as Error).message}` };
  }
}

export async function deleteAuthUser(userId: string): Promise<Result> {
  try {
    await ownerDb().begin(async (tx) => {
      await tx`delete from neon_auth.session where "userId" = ${userId}`;
      await tx`delete from neon_auth.account where "userId" = ${userId}`;
      await tx`delete from neon_auth."user" where id = ${userId}`;
    });
    return { error: null };
  } catch (err) {
    return { error: `Could not delete the login: ${(err as Error).message}` };
  }
}

export async function setAuthBanned(userId: string, banned: boolean): Promise<Result> {
  try {
    await ownerDb().begin(async (tx) => {
      const rows = await tx`
        update neon_auth."user"
        set banned = ${banned},
            "banReason" = ${banned ? "Deactivated by factory owner" : null},
            "banExpires" = null,
            "updatedAt" = now()
        where id = ${userId}
        returning id`;
      if (rows.length === 0) throw Object.assign(new Error("login not found"), { code: "user_not_found" });
      if (banned) await tx`delete from neon_auth.session where "userId" = ${userId}`;
    });
    return { error: null };
  } catch (err) {
    return { error: (err as Error).message, code: (err as { code?: string }).code };
  }
}

export async function setAuthPassword(userId: string, password: string): Promise<Result> {
  try {
    await ownerDb().begin(async (tx) => {
      const hash = hashPassword(password);
      const updated = await tx`
        update neon_auth.account set password = ${hash}, "updatedAt" = now()
        where "userId" = ${userId} and "providerId" = 'credential'
        returning id`;
      if (updated.length === 0) {
        await tx`
          insert into neon_auth.account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
          values (${randomUUID()}, ${userId}, 'credential', ${userId}, ${hash}, now(), now())`;
      }
      await tx`delete from neon_auth.session where "userId" = ${userId}`;
    });
    return { error: null };
  } catch (err) {
    return { error: `Could not set the password: ${(err as Error).message}` };
  }
}
