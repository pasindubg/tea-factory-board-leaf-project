import { describe, expect, it } from "vitest";
import { resources } from "./list-resource-registry";
import { applyListFilters, resolveSearchColumn } from "./list-search-query";

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
