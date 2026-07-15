import { describe, expect, it } from "vitest";
import { deleteTenantRow, withTenantDataScope } from "./tenant-data";
import { friendlyDeleteError } from "./errors";

type Operation = { name: string; args: unknown[] };

class FakeQuery {
  operations: Operation[] = [];

  constructor(private readonly singleResult: { data: unknown; error: unknown } = {
    data: { id: "deleted-row" },
    error: null,
  }) {}

  select(...args: unknown[]) { this.operations.push({ name: "select", args }); return this; }
  insert(...args: unknown[]) { this.operations.push({ name: "insert", args }); return this; }
  upsert(...args: unknown[]) { this.operations.push({ name: "upsert", args }); return this; }
  update(...args: unknown[]) { this.operations.push({ name: "update", args }); return this; }
  delete(...args: unknown[]) { this.operations.push({ name: "delete", args }); return this; }
  eq(...args: unknown[]) { this.operations.push({ name: "eq", args }); return this; }
  maybeSingle(...args: unknown[]) {
    this.operations.push({ name: "maybeSingle", args });
    return Promise.resolve(this.singleResult);
  }
}

function fakeClient(singleResult?: { data: unknown; error: unknown }) {
  const queries = new Map<string, FakeQuery>();
  const client = {
    auth: { marker: "auth" },
    from(table: string) {
      const query = new FakeQuery(singleResult);
      queries.set(table, query);
      return query;
    },
  };
  const scoped = withTenantDataScope(client as never, {
    factoryId: "factory-1",
    actorUserId: "user-1",
  });
  return { scoped, queries };
}

describe("tenant data boundary", () => {
  it("scopes selects to the authenticated factory", () => {
    const { scoped, queries } = fakeClient();
    scoped.from("suppliers").select("id, name").eq("active", true);
    expect(queries.get("suppliers")?.operations).toEqual([
      { name: "select", args: ["id, name"] },
      { name: "eq", args: ["factory_id", "factory-1"] },
      { name: "eq", args: ["active", true] },
    ]);
  });

  it("overrides factory_id on inserts and updates", () => {
    const { scoped, queries } = fakeClient();
    scoped.from("suppliers").insert({ name: "A", factory_id: "other-factory" });
    scoped.from("collectors").update({ name: "B", factory_id: "other-factory" }).eq("id", "collector-1");

    expect(queries.get("suppliers")?.operations[0]).toEqual({
      name: "insert",
      args: [{ name: "A", factory_id: "factory-1" }],
    });
    expect(queries.get("collectors")?.operations).toEqual([
      { name: "update", args: [{ name: "B", factory_id: "factory-1" }] },
      { name: "eq", args: ["factory_id", "factory-1"] },
      { name: "eq", args: ["id", "collector-1"] },
    ]);
  });

  it("scopes shared deletes and factory-root reads", async () => {
    const { scoped, queries } = fakeClient();
    await deleteTenantRow(scoped, "auction_grades", "grade-1");
    scoped.from("factories").select("id, name");

    expect(queries.get("auction_grades")?.operations).toEqual([
      { name: "delete", args: [] },
      { name: "eq", args: ["factory_id", "factory-1"] },
      { name: "eq", args: ["id", "grade-1"] },
      { name: "select", args: ["id"] },
      { name: "maybeSingle", args: [] },
    ]);
    expect(queries.get("factories")?.operations).toEqual([
      { name: "select", args: ["id, name"] },
      { name: "eq", args: ["id", "factory-1"] },
    ]);
  });

  it("does not report a silent zero-row delete as successful", async () => {
    const { scoped } = fakeClient({ data: null, error: null });
    await expect(deleteTenantRow(scoped, "brokers", "cross-tenant-or-stale-id"))
      .resolves.toEqual({
        error: "This record was not found or you do not have permission to delete it.",
      });
  });

  it("rejects unregistered tables", () => {
    const { scoped } = fakeClient();
    expect(() => scoped.from("unregistered_table")).toThrow(
      "Tenant data access is not registered for table: unregistered_table",
    );
  });

  it("names the dependent record type for restricted deletes", () => {
    expect(friendlyDeleteError({
      code: "23503",
      message: 'update or delete on table "brokers" violates foreign key constraint "auction_sales_broker_id_fkey" on table "auction_sales"',
      details: 'Key (id)=(broker-1) is still referenced from table "auction_sales".',
    })).toBe(
      "This record is being used by broker invoices and cannot be deleted. Remove or reassign those records first.",
    );
  });

  it.each([
    ["sale_lines", "sale lines"],
    ["settlements", "settlements"],
    ["vat_ledger", "VAT ledger entries"],
  ])("keeps protected %s dependencies readable", (table, label) => {
    expect(friendlyDeleteError({
      code: "23503",
      details: `Key (id)=(record-1) is still referenced from table "${table}".`,
    })).toContain(`being used by ${label}`);
  });

  it("does not mislabel non-delete database errors", () => {
    expect(friendlyDeleteError({ code: "23505", message: "duplicate key" }))
      .toBe("This record already exists (duplicate).");
  });
});
