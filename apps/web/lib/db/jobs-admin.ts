import "server-only";
import { ownerDb } from "@/lib/neon/owner-db";

// Trusted queue control plane only. Payload CRUD must use the factory-bound job actor.
export async function sweepDeadRuns(input: { now: string; deadline: string; message: string }) {
  await ownerDb()`
    update public."BACKGROUND_JOB_RUNS"
    set status = 'failed', error = ${input.message}, finished_at = ${input.now},
        lease_until = null, updated_at = ${input.now}
    where status = 'running' and updated_at < ${input.deadline}
      and (lease_until is null or lease_until < ${input.now})`;
}

export async function failRun(runId: string, message: string) {
  const now = new Date().toISOString();
  await ownerDb()`
    update public."BACKGROUND_JOB_RUNS"
    set status = 'failed', error = ${message}, finished_at = ${now}, lease_until = null, updated_at = ${now}
    where id = ${runId}`;
}

export async function claimNextRun(workerId: string, leaseSeconds: number): Promise<Record<string, unknown>[]> {
  return await ownerDb()`select * from public.claim_background_job(${workerId}, ${leaseSeconds})`;
}
