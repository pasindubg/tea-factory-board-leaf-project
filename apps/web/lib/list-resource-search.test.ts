import { describe, expect, it } from "vitest";
import { resources } from "./list-resource-registry";
import { applyListFilters, filterRowsByCriteria, resolveSearchColumn } from "./list-search-query";

// A locked role's criteria must reach the database, not just the rows already
// fetched — otherwise every row is shipped to the server component and only
// then dropped. These assert the per-resource `search` config each loader
// hands to `search.apply()`.
describe("auction.dispatches search pushdown", () => {
  const config = resources["auction.dispatches"].search!;

  it("declares a search config at all, so search.apply() can reach SQL", () => {
    expect(config).toBeDefined();
  });

  it("pushes the lockable status column down as a real SQL filter", () => {
    expect(resolveSearchColumn("status", config)).toEqual({ column: "status", mode: "contains" });
  });

  it("maps the broker column onto the embedded table", () => {
    expect(resolveSearchColumn("broker", config)).toEqual({ column: "brokers.name", mode: "contains", embed: "brokers" });
  });

  it("uses equals for date columns, since ilike errors on them", () => {
    expect(resolveSearchColumn("dispatch_date", config)).toEqual({ column: "dispatch_date", mode: "equals" });
    expect(resolveSearchColumn("sale_date", config)).toEqual({ column: "sale_date", mode: "equals" });
  });

  it("keeps display-formatted numbers out of SQL", () => {
    // Stored as a composite ("26B01-0021") but shown trimmed ("0021"), so an
    // ilike on the raw column would not match what the user actually typed.
    expect(resolveSearchColumn("sale_no", config)).toBeNull();
    expect(resolveSearchColumn("target_sale_no", config)).toBeNull();
  });

  it("emits the locked status criterion as an ilike on the base table", () => {
    const calls: string[] = [];
    const q: Record<string, (...a: unknown[]) => unknown> = {};
    for (const op of ["ilike", "eq", "gte", "lt"]) {
      q[op] = (col: unknown, val: unknown) => { calls.push(`${op}(${col},${val})`); return q; };
    }
    applyListFilters(q, { status: "Draft", sale_no: "0021" }, config);
    // status goes to SQL; sale_no is computed and stays a row-level match.
    expect(calls).toEqual(["ilike(status,%Draft%)"]);
  });
});

// Every resource that opts into `search` must be reachable by search.apply();
// a resource declaring columns but never calling apply would silently ignore
// its role locks at the SQL layer.
describe("search config integrity", () => {
  it("declares no column mapping for a key it also marks computed", () => {
    for (const [key, definition] of Object.entries(resources)) {
      const config = definition.search;
      if (!config) continue;
      for (const computed of config.computed ?? []) {
        expect(config.columns?.[computed], `${key}.${computed}`).toBeUndefined();
      }
    }
  });
});

/**
 * The server-side fallback filter compares a criterion against the row's own
 * property, with no access to the column's accessor. A boolean property is
 * matched as the Yes/No the column renders, so a `boolean` column needs no
 * companion label field. A value that is NOT a plain boolean (guarantee is
 * tri-state: Guarantee / Cash / Not sold) still has to carry its label.
 */
describe("row-level criteria against boolean and derived display values", () => {
  const rows = [
    { id: "a", onGuarantee: true, guaranteeLabel: "Guarantee", reprint: true },
    { id: "b", onGuarantee: false, guaranteeLabel: "Cash", reprint: false },
    { id: "c", onGuarantee: null, guaranteeLabel: "Not sold", reprint: false },
  ];

  it("matches a boolean property on the Yes/No the column shows", () => {
    expect(filterRowsByCriteria(rows, { reprint: "Yes" }).map((r) => r.id)).toEqual(["a"]);
    expect(filterRowsByCriteria(rows, { reprint: "No" }).map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("does not match a boolean against an unrelated label", () => {
    expect(filterRowsByCriteria(rows, { onGuarantee: "Guarantee" })).toHaveLength(0);
    expect(filterRowsByCriteria(rows, { onGuarantee: "Cash" })).toHaveLength(0);
  });

  it("matches every guarantee label once the row carries it", () => {
    expect(filterRowsByCriteria(rows, { guaranteeLabel: "Guarantee" }).map((r) => r.id)).toEqual(["a"]);
    expect(filterRowsByCriteria(rows, { guaranteeLabel: "Cash" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterRowsByCriteria(rows, { guaranteeLabel: "Not sold" }).map((r) => r.id)).toEqual(["c"]);
  });

  it("still returns everything when no criteria are set", () => {
    expect(filterRowsByCriteria(rows, {})).toHaveLength(3);
    expect(filterRowsByCriteria(rows, { guaranteeLabel: "" })).toHaveLength(3);
  });
});
