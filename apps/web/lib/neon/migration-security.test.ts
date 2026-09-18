import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { getJobsEnv } from "../env";

afterEach(() => vi.unstubAllEnvs());

describe("Neon cutover security regressions", () => {
  it("does not require a Supabase JWT secret to trigger jobs", () => {
    vi.stubEnv("SUPABASE_JWT_SECRET", "");
    vi.stubEnv("JOBS_TICK_SECRET", "test-only");
    expect(getJobsEnv()).toEqual({ tickSecret: "test-only" });
  });
  it("still refuses jobs without a worker secret", () => {
    vi.stubEnv("JOBS_TICK_SECRET", "");
    expect(() => getJobsEnv()).toThrow("JOBS_TICK_SECRET");
  });
  it("never re-grants every RPC to ordinary users", () => {
    const grants = readFileSync(new URL("../../../../packages/db/neon/002_grants.sql", import.meta.url), "utf8");
    expect(grants).not.toMatch(/GRANT EXECUTE ON ALL FUNCTIONS/i);
    expect(grants).toMatch(/REVOKE EXECUTE ON FUNCTION public\.claim_background_job\(text, integer\) FROM PUBLIC, authenticated, anon, anonymous/);
  });
  it("has no OTP or Supabase auth path in login", () => {
    const login = readFileSync(new URL("../../app/login/page.tsx", import.meta.url), "utf8");
    expect(login).not.toMatch(/supabase|signInWithOtp|verifyOtp|Email code/);
    expect(login).toContain("signInWithUsername(username, password)");
  });
});
