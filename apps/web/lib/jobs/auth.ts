import "server-only";
import { createNeonClient } from "@/lib/neon/data-client";
import { factoryOfUser, jobRunnerToken } from "@/lib/neon/job-identity";

// Job payload operations use a factory-bound identity, never the owner connection.
export async function createJobClient(userId: string) {
  const factoryId = await factoryOfUser(userId);
  if (!factoryId) throw new Error("The job actor has no factory.");
  return createNeonClient({ accessToken: await jobRunnerToken(factoryId) });
}
export type JobClient = Awaited<ReturnType<typeof createJobClient>>;
