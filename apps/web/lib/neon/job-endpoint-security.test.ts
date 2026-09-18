import { afterEach, describe, expect, it, vi } from "vitest";

const { claimRun } = vi.hoisted(() => ({ claimRun: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/jobs/worker", () => ({ claimRun, runChunk: vi.fn() }));
vi.mock("next/server", async (original) => ({
  ...await original<typeof import("next/server")>(),
  after: vi.fn(),
}));
import { GET, POST } from "../../app/api/jobs/tick/route";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("worker endpoint authentication", () => {
  it("rejects a forged cron header before touching the queue", async () => {
    vi.stubEnv("JOBS_TICK_SECRET", "worker-test-secret");
    const response = await POST(new Request("https://example.test/api/jobs/tick", {
      method: "POST", headers: { "x-vercel-cron": "1" },
    }));
    expect(response.status).toBe(401);
    expect(claimRun).not.toHaveBeenCalled();
  });
  it("accepts authenticated Vercel GET ticks", async () => {
    vi.stubEnv("JOBS_TICK_SECRET", "worker-test-secret");
    vi.stubEnv("CRON_SECRET", "cron-test-secret");
    const response = await GET(new Request("https://example.test/api/jobs/tick", {
      headers: { authorization: "Bearer cron-test-secret" },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ claimed: 0 });
    expect(claimRun).toHaveBeenCalledOnce();
  });
  it("accepts authenticated worker handovers", async () => {
    vi.stubEnv("JOBS_TICK_SECRET", "worker-test-secret");
    const response = await POST(new Request("https://example.test/api/jobs/tick", {
      method: "POST", headers: { authorization: "Bearer worker-test-secret" },
    }));
    expect(response.status).toBe(200);
    expect(claimRun).toHaveBeenCalledOnce();
  });
});
