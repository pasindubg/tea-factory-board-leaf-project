import { beforeEach, describe, expect, it, vi } from "vitest";
const gates = vi.hoisted(() => ({ page: vi.fn(), module: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/profile", () => ({ requirePagePermission: gates.page, requireModuleAccess: gates.module }));
vi.mock("next/cache", () => ({ revalidatePath: gates.revalidate }));
import { createDriver, updateDriver } from "@/app/dashboard/drivers/actions";
import { loadLovOptions } from "@/lib/list-lov-registry";
import { withTenantDataScope } from "@/lib/tenant-data";

let writes: Record<string, unknown>[];
let tables: Record<string, Record<string, unknown>[]>;
function client() {
  return {
    from(table: string) {
      const filters: [string, unknown][] = [];
      let changes: Record<string, unknown> | undefined;
      const matches = () => (tables[table] ?? []).filter((row) => filters.every(([key, value]) => row[key] === value));
      const query: any = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
        order: () => query,
        range: async () => ({ data: matches(), error: null }),
        insert: async (value: Record<string, unknown>) => { writes.push(value); return { error: null }; },
        update: (value: Record<string, unknown>) => { changes = value; return query; },
        maybeSingle: async () => {
          const row = matches()[0];
          if (row && changes) writes.push({ ...changes, id: row.id });
          return { data: row ?? null, error: null };
        },
      };
      return query;
    },
  };
}
function form(user: string) { const data = new FormData(); data.set("user_id", user); data.set("name", "Forged name"); data.set("factory_id", "factory-b"); return data; }
beforeEach(() => {
  vi.clearAllMocks(); writes = [];
  tables = {
    users: [
      { id: "driver-user", factory_id: "factory-a", name: "Existing Driver", username: "driver.a", role: "driver", active: true },
      { id: "foreign-user", factory_id: "factory-b", name: "Foreign Driver", role: "driver", active: true },
      { id: "collector-user", factory_id: "factory-a", name: "Collector", role: "collector", active: true },
      { id: "inactive-user", factory_id: "factory-a", name: "Inactive", role: "driver", active: false },
    ],
    drivers: [{ id: "own-driver", factory_id: "factory-a" }, { id: "foreign-driver", factory_id: "factory-b" }],
  };
  const profile = { id: "owner", role: "owner", factory_id: "factory-a" };
  const supabase = withTenantDataScope(client() as never, { factoryId: profile.factory_id, actorUserId: profile.id });
  gates.page.mockResolvedValue({ supabase, profile }); gates.module.mockResolvedValue({ supabase, profile });
});

describe("Driver User ID links", () => {
  it("creates a driver from the selected existing user and ignores forged identity fields", async () => {
    expect((await createDriver(form("driver-user"))).ok).toBe(true);
    expect(writes[0]).toMatchObject({ user_id: "driver-user", name: "Existing Driver", factory_id: "factory-a" });
    expect(gates.page).toHaveBeenCalledWith("drivers", "create");
  });
  it.each(["foreign-user", "collector-user", "inactive-user", "missing-user", ""])("refuses invalid or unavailable User ID %s", async (id) => {
    expect((await createDriver(form(id))).ok).toBe(false);
    expect(writes).toHaveLength(0);
  });
  it("edits only an in-factory driver and derives the name from its user", async () => {
    expect((await updateDriver("own-driver", form("driver-user"))).ok).toBe(true);
    expect(writes[0]).toMatchObject({ id: "own-driver", name: "Existing Driver", user_id: "driver-user", factory_id: "factory-a" });
    writes = [];
    expect((await updateDriver("foreign-driver", form("driver-user"))).ok).toBe(false);
    expect(writes).toHaveLength(0);
  });
  it("enforces the page action permission before querying users", async () => {
    gates.page.mockRejectedValue(new Error("Permission denied"));
    await expect(createDriver(form("driver-user"))).rejects.toThrow("Permission denied");
    expect(writes).toHaveLength(0);
  });
  it("offers only active same-factory Driver users in the LOV", async () => {
    const result = await loadLovOptions("users.driver-accounts", "");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.map((option) => option.value)).toEqual(["driver-user"]);
      expect(result.options[0].label).toBe("driver.a");
    }
    expect(gates.module).toHaveBeenCalledWith("drivers");
  });
});
