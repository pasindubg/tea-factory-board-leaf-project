import { beforeEach, describe, expect, it, vi } from "vitest";
const gates = vi.hoisted(() => ({ page: vi.fn() }));
vi.mock("@/lib/profile", () => ({ requirePagePermission: gates.page }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { createSupplier, updateSupplier } from "@/app/dashboard/suppliers/actions";
import { withTenantDataScope } from "@/lib/tenant-data";

let writes: Record<string, unknown>[];
function form(customerNo = "") {
  const data = new FormData();
  for (const [key, value] of Object.entries({ customer_no: customerNo, name: "Supplier", phone: "0771234567", latitude: "6.9", longitude: "79.8", factory_id: "foreign", registration_no: "999" })) data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks(); writes = [];
  const client = { from() {
    const filters: Record<string, string> = {};
    let changes: Record<string, unknown>;
    const query: any = {
      eq: (key: string, value: string) => { filters[key] = value; return query; },
      select: () => query,
      update: (value: Record<string, unknown>) => { changes = value; return query; },
      insert: async (value: Record<string, unknown>) => { writes.push(value); return { error: null }; },
      maybeSingle: async () => {
        const exists = filters.factory_id === "own-factory" && filters.id === "own-supplier";
        if (exists) writes.push(changes);
        return { data: exists ? { id: filters.id } : null, error: null };
      },
    };
    return query;
  } };
  gates.page.mockResolvedValue({ profile: { factory_id: "own-factory", id: "office" }, supabase: withTenantDataScope(client as never, { factoryId: "own-factory", actorUserId: "office" }) });
});

describe("office customer number assignment", () => {
  it("creates a supplier awaiting office assignment and leaves numbering to the database", async () => {
    expect((await createSupplier(form())).ok).toBe(true);
    expect(writes[0]).toMatchObject({ customer_no: null, factory_id: "own-factory" });
    expect(writes[0]).not.toHaveProperty("registration_no");
    expect(gates.page).toHaveBeenCalledWith("suppliers", "create");
  });
  it("assigns the existing number with its leading zeros and ignores a forged registration number", async () => {
    expect((await updateSupplier("own-supplier", form("000123"))).ok).toBe(true);
    expect(writes[0].customer_no).toBe("000123");
    expect(writes[0]).not.toHaveProperty("registration_no");
    expect(gates.page).toHaveBeenCalledWith("suppliers", "update");
  });
  it("allows office edits before the customer number has been assigned", async () => {
    expect((await updateSupplier("own-supplier", form())).ok).toBe(true);
    expect(writes[0].customer_no).toBeNull();
  });
  it("rejects nonnumeric office numbers and cross-factory records", async () => {
    expect((await updateSupplier("own-supplier", form("abc"))).ok).toBe(false);
    expect((await updateSupplier("foreign-supplier", form("000123"))).ok).toBe(false);
    expect(writes).toHaveLength(0);
  });
  it("requires office action permissions before accessing supplier data", async () => {
    gates.page.mockRejectedValue(new Error("Permission denied"));
    await expect(updateSupplier("own-supplier", form("000123"))).rejects.toThrow("Permission denied");
    await expect(createSupplier(form())).rejects.toThrow("Permission denied");
    expect(writes).toHaveLength(0);
  });
});
