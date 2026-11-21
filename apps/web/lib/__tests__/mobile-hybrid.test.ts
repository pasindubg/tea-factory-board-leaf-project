import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gate: vi.fn(), driverSuppliers: vi.fn(), upload: vi.fn(),
}));
vi.mock("@/lib/neon/mobile-session", () => ({ requireMobileProfile: mocks.gate }));
vi.mock("@/lib/mobile-driver-lines", () => ({ mobileRegistrationLineIds: vi.fn() }));
vi.mock("@/lib/mobile-resource-registry", async (real) => ({
  ...await real<object>(), mobileDriverSupplierIds: mocks.driverSuppliers,
}));
vi.mock("@/lib/neon/storage", () => ({ createSupplierPhoto: mocks.upload }));

import { POST } from "@/app/api/mobile/command/route";
import { PUT } from "@/app/api/mobile/supplier-documents/route";

const factory = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const foreign = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const actor = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const supplier = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const id = "11111111-1111-4111-8111-111111111111";

const write = vi.fn();
const query = {
  select: vi.fn(), eq: vi.fn(), in: vi.fn(), maybeSingle: vi.fn(),
  update: write, insert: write,
};

beforeEach(() => {
  vi.resetAllMocks();
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  write.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data: null, error: null });
  mocks.driverSuppliers.mockResolvedValue([supplier]);
  mocks.gate.mockResolvedValue({
    deviceBound: true,
    profile: { id: actor, factory_id: factory, role: "driver" },
    supabase: { from: vi.fn(() => query) },
  });
  mocks.upload.mockResolvedValue(true);
});

function command(body: unknown) {
  return POST(new Request("https://test.example.com/api/mobile/command", {
    method: "POST", body: JSON.stringify(body),
  }));
}

describe("hybrid mobile commands", () => {
  it("rejects client-selected factory and acting user before looking up data", async () => {
    for (const selector of [{ factory_id: foreign }, { handed_by: actor }, { table: "supplier_requests" }]) {
      expect((await command({ action: "driver.handover", id, ...selector })).status).toBe(400);
    }
    expect(mocks.gate).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("uses the driver role and refuses data changes when the auth gate denies access", async () => {
    mocks.gate.mockResolvedValue(new Response(null, { status: 403 }));
    expect((await command({ action: "driver.handover", id })).status).toBe(403);
    expect(mocks.gate).toHaveBeenCalledWith(expect.any(Request), ["driver"]);
    expect(write).not.toHaveBeenCalled();
  });

  it("checks the bound device and assigned suppliers before a handover", async () => {
    const caller = await mocks.gate();
    mocks.gate.mockResolvedValue({ ...caller, deviceBound: false });
    expect((await command({ action: "driver.handover", id })).status).toBe(403);
    expect(write).not.toHaveBeenCalled();

    mocks.gate.mockResolvedValue(caller);
    expect((await command({ action: "driver.handover", id })).status).toBe(409);
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ handed_by: actor, status: "handed_to_driver" }));
    expect(query.in).toHaveBeenCalledWith("supplier_id", [supplier]);
    expect(query.eq).toHaveBeenCalledWith("status", "approved");
  });
});

describe("hybrid photo upload", () => {
  function photo(targetFactory: string, body: Uint8Array = new Uint8Array([255, 216, 255, 224])) {
    return PUT(new Request(`https://test.example.com/api/mobile/supplier-documents?path=${targetFactory}/${id}/photo.jpg`, {
      method: "PUT", body: Uint8Array.from(body).buffer, headers: { "Content-Type": "image/jpeg" },
    }));
  }

  it("rejects another factory's path and oversized or invalid JPEGs", async () => {
    expect((await photo(foreign)).status).toBe(403);
    expect((await photo(factory, new Uint8Array([1, 2, 3, 4]))).status).toBe(415);
    expect((await photo(factory, new Uint8Array(2 * 1024 * 1024 + 1))).status).toBe(413);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("uses the authenticated factory for the create-only upload", async () => {
    expect((await photo(factory)).status).toBe(200);
    expect(mocks.upload).toHaveBeenCalledWith(factory, `${factory}/${id}/photo.jpg`, expect.any(Uint8Array));
    mocks.upload.mockResolvedValue(false);
    expect((await photo(factory)).status).toBe(409);
  });
});
