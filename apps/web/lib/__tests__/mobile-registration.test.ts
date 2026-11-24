import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), objectExists: vi.fn(), presignUpload: vi.fn() }));
vi.mock("@/lib/neon/data-client", () => ({ createNeonClient: mocks.createClient }));
vi.mock("@/lib/neon/storage", () => ({ objectExists: mocks.objectExists, presignUpload: mocks.presignUpload, neonBucket: vi.fn() }));
vi.mock("@/lib/profile", () => ({ requireModuleAccess: vi.fn(), requirePageAccess: vi.fn(), requireProfile: vi.fn() }));
import { POST as register } from "@/app/api/mobile/suppliers/route";
import { POST as upload } from "@/app/api/mobile/supplier-documents/route";
import { loadMobileRegistrationResource } from "@/lib/list-resource-registry";
import { roleMayRegisterSuppliers } from "@/lib/roles";

const factory = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const foreign = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const actor = "11111111-1111-4111-8111-111111111111";
const line = "22222222-2222-4222-8222-222222222222";
const unassignedLine = "55555555-5555-4555-8555-555555555555";
const driverId = "66666666-6666-4666-8666-666666666666";
const otherLine = "33333333-3333-4333-8333-333333333333";
const supplier = "44444444-4444-4444-8444-444444444444";
let role: string, bound: boolean, active: boolean;
let inserted: Record<string, unknown>[], insertError: unknown;
let rows: Record<string, Record<string, unknown>[]>;

function request(body: unknown, signedIn = true) {
  return new Request("http://localhost/api/mobile/test", {
    method: "POST", headers: { "Content-Type": "application/json", ...(signedIn ? { Authorization: "Bearer verified-by-data-api", "x-device-id": "registered-phone" } : {}) },
    body: JSON.stringify(body),
  });
}
function client() {
  return {
    rpc: async (name: string) => ({ data: name === "request_uid" ? actor : name === "current_factory_id" ? factory : bound, error: null }),
    from(table: string) {
      const filters: [string, unknown][] = [];
      const matches = () => (table === "users" ? [{ id: actor, name: "Field user", role, active, factory_id: factory }] : rows[table] ?? [])
        .filter((row) => filters.every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value));
      let insertResult: Record<string, unknown> | undefined;
      const query: any = {
        then: (resolve: any) => Promise.resolve({ data: matches(), error: null }).then(resolve),
        in: (key: string, value: unknown[]) => { filters.push([key, value]); return query; },
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
        maybeSingle: async () => ({ data: matches()[0] ?? null, error: null }),
        order: async () => ({ data: matches(), error: null }),
        insert: (values: Record<string, unknown>) => { inserted.push(values); insertResult = { id: values.id, registration_no: 42 }; return query; },
        single: async () => ({ data: insertResult, error: insertError }),
      };
      return query;
    },
  };
}
const input = () => ({ id: supplier, line_id: line, name: "New supplier", phone: "0771234567", latitude: 6.9271, longitude: 79.8612 });

beforeEach(() => {
  vi.clearAllMocks(); role = "driver"; bound = true; active = true; inserted = []; insertError = null;
  rows = {
    lines: [{ id: line, factory_id: factory, active: true }, { id: otherLine, factory_id: foreign, active: true }, { id: unassignedLine, factory_id: factory, active: true }],
    suppliers: [], drivers: [{ id: driverId, user_id: actor, factory_id: factory, active: true }],
    line_drivers: [{ id: "assignment", driver_id: driverId, line_id: line, factory_id: factory }],
  };
  mocks.createClient.mockImplementation(client);
  mocks.objectExists.mockResolvedValue(false);
  mocks.presignUpload.mockResolvedValue("https://storage.example.test/signed");
});

describe("mobile registration permissions and identity", () => {
  it.each(["driver", "field_officer"])("allows %s registration and derives tenant and actor server-side", async (allowed) => {
    role = allowed;
    const response = await register(request({ ...input(), factory_id: foreign, registered_by_user_id: "forged", client_uuid: "forged" }));
    expect(response.status).toBe(201);
    expect(inserted[0]).toMatchObject({ factory_id: factory, registered_by_user_id: actor, id: supplier, client_uuid: supplier, customer_no: null });
    expect(inserted[0]).not.toHaveProperty("registration_no");
    expect((await response.json()).registrationNo).toBe(42);
  });
  it.each(["collector", "supplier", "manager", "unknown"])("refuses %s access to the mobile registration API", async (denied) => {
    role = denied;
    expect((await register(request(input()))).status).toBe(403);
    expect(inserted).toHaveLength(0);
    expect(roleMayRegisterSuppliers(denied)).toBe(false);
  });
  it.each(["driver", "field_officer"])("requires the active mobile session for %s", async (allowed) => {
    role = allowed; bound = false;
    expect((await register(request(input()))).status).toBe(401);
    expect(inserted).toHaveLength(0);
  });
  it("refuses unsigned and inactive accounts", async () => {
    expect((await register(request(input(), false))).status).toBe(401);
    active = false;
    expect((await register(request(input()))).status).toBe(403);
  });
  it("refuses cross-factory and inactive line IDs", async () => {
    expect((await register(request({ ...input(), line_id: otherLine }))).status).toBe(404);
    rows.lines[0].active = false;
    expect((await register(request(input()))).status).toBe(404);
    expect(inserted).toHaveLength(0);
  });
  it.each(["driver", "field_officer"])("prevents %s from supplying either number", async (allowed) => {
    role = allowed;
    for (const changed of [{ customer_no: "000123" }, { registration_no: 99 }]) {
      const response = await register(request({ ...input(), ...changed }));
      expect(response.status).toBe(400);
    }
    expect(inserted).toHaveLength(0);
  });
  it("requires valid GPS", async () => {
    for (const changed of [{ latitude: null }, { longitude: 181 }, { location_accuracy_m: -1 }]) {
      expect((await register(request({ ...input(), ...changed }))).status).toBe(400);
    }
    expect(inserted).toHaveLength(0);
  });
  it("retries an already completed registration without creating another supplier", async () => {
    rows.suppliers.push({ id: supplier, factory_id: factory, registered_by_user_id: actor, registration_no: 42, customer_no: "000123", line_id: line });
    const response = await register(request(input()));
    expect(response.status).toBe(200);
    expect((await response.json()).registrationNo).toBe(42);
    expect(inserted).toHaveLength(0);
  });
  it("does not reuse another actor's registration", async () => {
    rows.suppliers.push({ id: supplier, factory_id: factory, registered_by_user_id: "someone-else", registration_no: 42, customer_no: "000123", line_id: line });
    expect((await register(request(input()))).status).toBe(409);
  });
  it("returns a conflict for a duplicate registration", async () => {
    insertError = { code: "23505" };
    const response = await register(request(input()));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBeTruthy();
  });
  it("refuses a forged image path and verifies images before attaching them", async () => {
    expect((await register(request({ ...input(), photo_path: `${foreign}/${supplier}/photo.jpg` }))).status).toBe(403);
    expect((await register(request({ ...input(), photo_path: `${factory}/${supplier}/photo.jpg` }))).status).toBe(400);
    expect(inserted).toHaveLength(0);
    mocks.objectExists.mockResolvedValue(true);
    expect((await register(request({ ...input(), bank_book_path: `${factory}/${supplier}/bank-book.jpg`, bank_parse_status: "confirmed" }))).status).toBe(201);
    expect(inserted[0].bank_parse_status).toBe("pending");
  });
});

describe("native list read models", () => {
  it("refuses an unassigned line in the same factory for both reading and registration", async () => {
    expect((await loadMobileRegistrationResource(request({}), { key: "field.line-suppliers", params: { lineId: unassignedLine } })).status).toBe(404);
    expect((await register(request({ ...input(), line_id: unassignedLine }))).status).toBe(404);
    expect(inserted).toHaveLength(0);
  });
  it.each(["unlinked", "unassigned", "inactive"])("gives an %s driver no lines or registration access", async (kind) => {
    if (kind === "unlinked") rows.drivers = [];
    if (kind === "unassigned") rows.line_drivers = [];
    if (kind === "inactive") rows.drivers[0].active = false;
    const response = await loadMobileRegistrationResource(request({}), { key: "field.lines" });
    expect((await response.json()).rows).toEqual([]);
    expect((await register(request(input()))).status).toBe(404);
  });
  it("keeps field-officer registration on all active factory lines", async () => {
    role = "field_officer";
    const response = await loadMobileRegistrationResource(request({}), { key: "field.lines" });
    expect((await response.json()).rows.map((row: any) => row.id)).toEqual([line, unassignedLine]);
    expect((await register(request({ ...input(), line_id: unassignedLine }))).status).toBe(201);
  });
  it("returns only active lines in the signed-in factory", async () => {
    const response = await loadMobileRegistrationResource(request({}), { key: "field.lines" });
    expect((await response.json()).rows).toEqual([rows.lines[0]]);
  });
  it("rejects arbitrary resources, tenant parameters and foreign line IDs", async () => {
    expect((await loadMobileRegistrationResource(request({}), { key: "users.accounts" })).status).toBe(400);
    expect((await loadMobileRegistrationResource(request({}), { key: "field.lines", params: { factory_id: foreign } })).status).toBe(400);
    expect((await loadMobileRegistrationResource(request({}), { key: "field.line-suppliers", params: { lineId: otherLine } })).status).toBe(404);
  });
  it("keeps supplier lists scoped to both the line and factory", async () => {
    rows.suppliers = [{ id: supplier, factory_id: factory, line_id: line }, { id: "foreign", factory_id: foreign, line_id: line }];
    const response = await loadMobileRegistrationResource(request({}), { key: "field.line-suppliers", params: { lineId: line } });
    expect((await response.json()).rows).toEqual([rows.suppliers[0]]);
  });
});

describe("supplier photo uploads", () => {
  const image = () => ({ path: `${factory}/${supplier}/photo.jpg`, contentType: "image/jpeg", size: 128 });
  it.each(["driver", "field_officer"])("allows create-only uploads for a bound %s", async (allowed) => {
    role = allowed;
    expect((await upload(request(image()))).status).toBe(200);
    expect(mocks.presignUpload).toHaveBeenCalledWith("supplier-documents", image().path, "image/jpeg", 128, 300, true);
  });
  it("rejects unbound, foreign-path and overwrite uploads", async () => {
    bound = false;
    expect((await upload(request(image()))).status).toBe(401);
    bound = true;
    expect((await upload(request({ ...image(), path: `${foreign}/${supplier}/photo.jpg` }))).status).toBe(403);
    mocks.objectExists.mockResolvedValue(true);
    expect((await upload(request(image()))).status).toBe(403);
    expect(mocks.presignUpload).not.toHaveBeenCalled();
  });
});
