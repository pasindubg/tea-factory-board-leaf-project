import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ signIn: vi.fn(), token: vi.fn(), signOut: vi.fn(), resolveEmail: vi.fn(), profile: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/neon/auth", () => ({ signInWithPassword: mock.signIn, getAccessToken: mock.token, signOut: mock.signOut }));
vi.mock("@/lib/neon/owner-db", () => ({ resolveLoginEmail: mock.resolveEmail }));
vi.mock("@/lib/neon/mobile-session", async (importActual) => ({
  ...await importActual<object>(), mobileProfileForToken: mock.profile,
}));

import { POST } from "@/app/api/mobile/sign-in/route";

function signIn(deviceId?: string) {
  return POST(new Request("https://mobile.example.test/api/mobile/sign-in", {
    method: "POST",
    headers: deviceId ? { "x-device-id": deviceId } : {},
    body: JSON.stringify({ username: "test.driver", password: "test-password", device: { platform: "android", model: "Test phone", appVersion: "1" } }),
  }));
}

beforeEach(() => {
  vi.resetAllMocks();
  mock.resolveEmail.mockResolvedValue("driver@example.test");
  mock.signIn.mockResolvedValue({ user: { id: "driver" }, setCookie: ["__Secure-neon-auth.session_token=fake.signature; Path=/"] });
  mock.token.mockResolvedValue({ token: "jwt" });
  mock.signOut.mockResolvedValue({ error: null });
  mock.profile.mockResolvedValue({ profile: { id: "driver", role: "driver" }, supabase: { rpc: mock.rpc } });
  mock.rpc.mockResolvedValue({ data: "claimed" });
});

describe("single active mobile session", () => {
  it("issues the session only after the authenticated phone claims it", async () => {
    const response = await signIn("test-android");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.proof).toMatch(/^[0-9a-f]{64}$/);
    expect(mock.profile).toHaveBeenCalledWith("jwt", expect.any(Array), "test-android", body.proof);
    expect(mock.rpc).toHaveBeenCalledWith("register_mobile_session", { p_platform: "android", p_model: "Test phone", p_app_version: "1" });
    expect(mock.signOut).not.toHaveBeenCalled();
  });

  it("returns a conflict and closes the new auth session when another phone is signed in", async () => {
    mock.rpc.mockResolvedValue({ data: "blocked" });
    const response = await signIn("other-phone");
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: expect.stringContaining("already signed in on another device") });
    expect(mock.signOut).toHaveBeenCalledWith("__Secure-neon-auth.session_token=fake.signature");
  });

  it("never attempts to claim a mobile session after an invalid password or without a phone", async () => {
    mock.signIn.mockResolvedValueOnce({ user: null, error: "invalid", setCookie: [] });
    expect((await signIn("test-android")).status).toBe(401);
    expect((await signIn()).status).toBe(400);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});
