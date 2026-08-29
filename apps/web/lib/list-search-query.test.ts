import { describe, expect, it } from "vitest";
import { activeEmbeds, applyListFilters, embedSelect, filterRowsByAdvancedQuery, filterRowsByCriteria, resolveSearchColumn, splitPage } from "./list-search-query";

describe("resolveSearchColumn", () => {
  it("auto-maps a plain UI key to its snake_case base column", () => {
    expect(resolveSearchColumn("weightKg", {})).toEqual({ column: "weight_kg", mode: "contains" });
    expect(resolveSearchColumn("occurredOn", {})).toEqual({ column: "occurred_on", mode: "contains" });
    expect(resolveSearchColumn("title", {})).toEqual({ column: "title", mode: "contains" });
  });

  it("prefers an explicit declaration over the convention", () => {
    const config = { columns: { supplierName: { column: "suppliers.name", mode: "contains" as const, embed: "suppliers" } } };
    expect(resolveSearchColumn("supplierName", config)).toEqual({ column: "suppliers.name", mode: "contains", embed: "suppliers" });
  });

  it("refuses to push a JS-computed key into SQL", () => {
    // Guessing `reprint_sales` would 400 the whole list; null means the
    // row-level filter in loadListResource enforces it instead.
    expect(resolveSearchColumn("reprintSales", { computed: ["reprintSales"] })).toBeNull();
  });
});

describe("applyListFilters column-type modes", () => {
  // Records which builder method each mode reaches for; the real Postgres
  // behaviour behind these choices is probed separately against the DB.
  function spy() {
    const calls: string[] = [];
    const q: Record<string, (...a: unknown[]) => unknown> = {};
    for (const op of ["ilike", "eq", "gte", "lt", "gt", "lte", "or", "range"]) {
      q[op] = (col: unknown, val: unknown) => { calls.push(`${op}(${col},${val})`); return q; };
    }
    return { q, calls };
  }

  it("uses ilike for an auto-mapped (text) column", () => {
    const { q, calls } = spy();
    applyListFilters(q, { supplierName: "Silva" }, {});
    expect(calls).toEqual(["ilike(supplier_name,%Silva%)"]);
  });

  it("uses eq for an equals column", () => {
    const { q, calls } = spy();
    applyListFilters(q, { active: "true" }, { columns: { active: { column: "active", mode: "equals" } } });
    expect(calls).toEqual(["eq(active,true)"]);
  });

  it("expands a day-mode timestamp column into a half-open day range", () => {
    // eq('collected_at','2026-06-22') matches midnight only and silently
    // returns nothing — this range is what makes a date search actually work.
    const { q, calls } = spy();
    applyListFilters(q, { collectedAt: "2026-06-22" }, { columns: { collectedAt: { column: "collected_at", mode: "day" } } });
    expect(calls).toEqual(["gte(collected_at,2026-06-22T00:00:00)", "lt(collected_at,2026-06-23T00:00:00)"]);
  });

  it("rolls a day range across a month boundary", () => {
    const { q, calls } = spy();
    applyListFilters(q, { d: "2026-06-30" }, { columns: { d: { column: "d", mode: "day" } } });
    expect(calls).toEqual(["gte(d,2026-06-30T00:00:00)", "lt(d,2026-07-01T00:00:00)"]);
  });

  it("ignores a day-mode value that is not a plain date", () => {
    const { q, calls } = spy();
    applyListFilters(q, { d: "not-a-date" }, { columns: { d: { column: "d", mode: "day" } } });
    expect(calls).toEqual([]);
  });
});

describe("activeEmbeds / embedSelect", () => {
  const config = { columns: { recipient: { column: "suppliers.name", mode: "contains" as const, embed: "suppliers" } } };

  it("promotes an embed to !inner only while its criterion is active", () => {
    expect(embedSelect("id, suppliers(name)", activeEmbeds({ recipient: "Silva" }, null, config)))
      .toBe("id, suppliers!inner(name)");
    // No criterion: left join preserved, so rows with a null FK still appear.
    expect(embedSelect("id, suppliers(name)", activeEmbeds({}, null, config)))
      .toBe("id, suppliers(name)");
  });

  it("detects an embed referenced from the advanced query", () => {
    expect([...activeEmbeds({}, "recipient:Silva", config)]).toEqual(["suppliers"]);
  });
});

// filterRowsByCriteria is the server-side enforcement point shared by both
// list paths: the registry (loadListResource) and detail-page side panels
// (applyServerListSearch). A row it drops is never serialized to the browser.
describe("filterRowsByCriteria", () => {
  const rows = [
    { id: "1", name: "K. Gunasekara", area: "Akmeemana", active: true },
    { id: "2", name: "P. Fernando", area: "Akmeemana", active: true },
    { id: "3", name: "W. Silva", area: "Baddegama", active: false },
  ];

  it("returns every row when no criteria are set", () => {
    expect(filterRowsByCriteria(rows, {})).toHaveLength(3);
    expect(filterRowsByCriteria(rows, undefined)).toHaveLength(3);
  });

  it("drops rows that do not match a locked criterion", () => {
    const visible = filterRowsByCriteria(rows, { area: "Akmeemana" });
    expect(visible.map((row) => row.id)).toEqual(["1", "2"]);
  });

  it("requires every criterion to match", () => {
    expect(filterRowsByCriteria(rows, { area: "Akmeemana", name: "Silva" })).toHaveLength(0);
    expect(filterRowsByCriteria(rows, { area: "Akmeemana", name: "Fernando" })).toHaveLength(1);
  });

  it("matches case-insensitively on a substring", () => {
    expect(filterRowsByCriteria(rows, { name: "gunasekara" })).toHaveLength(1);
  });

  it("ignores blank criteria rather than filtering everything out", () => {
    expect(filterRowsByCriteria(rows, { area: "   " })).toHaveLength(3);
  });

  it("matches non-string row values through their string form", () => {
    expect(filterRowsByCriteria(rows, { active: "false" }).map((row) => row.id)).toEqual(["3"]);
  });

  it("drops every row when a criterion names a field the rows do not have", () => {
    // Fail closed: an unknown locked key must not silently widen access.
    expect(filterRowsByCriteria(rows, { missingField: "x" })).toHaveLength(0);
  });
});

describe("filterRowsByAdvancedQuery", () => {
  const rows = [
    { id: "1", broker: "BPML", netKg: 120, area: "Akmeemana" },
    { id: "2", broker: "ASIA SIYAKA", netKg: 80, area: "Akmeemana" },
    { id: "3", broker: "BPML", netKg: 200, area: "Baddegama" },
  ];

  it("returns every row for an empty query", () => {
    expect(filterRowsByAdvancedQuery(rows, "")).toHaveLength(3);
    expect(filterRowsByAdvancedQuery(rows, null)).toHaveLength(3);
    expect(filterRowsByAdvancedQuery(rows, undefined)).toHaveLength(3);
  });

  it("free-text tokens OR-match across every row value", () => {
    expect(filterRowsByAdvancedQuery(rows, "akmeemana").map((r) => r.id)).toEqual(["1", "2"]);
  });

  it("a key:value token substring-matches that row property", () => {
    expect(filterRowsByAdvancedQuery(rows, "broker:BPML").map((r) => r.id)).toEqual(["1", "3"]);
  });

  it("a key>value token numeric-compares that row property", () => {
    expect(filterRowsByAdvancedQuery(rows, "netKg>100").map((r) => r.id)).toEqual(["1", "3"]);
  });

  it("ANDs multiple tokens together — this is how a locked query composes with a role's own further terms", () => {
    // Simulates: lockedAdvancedQuery = "broker:BPML", role types "netKg>150".
    const locked = "broker:BPML";
    const own = "netKg>150";
    expect(filterRowsByAdvancedQuery(rows, `${locked} ${own}`).map((r) => r.id)).toEqual(["3"]);
  });

  it("falls back to a free-text match when the key does not exist on the row", () => {
    expect(filterRowsByAdvancedQuery(rows, "missing:x")).toHaveLength(0);
  });

  // Negation. Without it there is no way to ask for "everything except", which
  // is the commonest thing an operator wants from a history list.
  it("key!=value excludes exact matches", () => {
    expect(filterRowsByAdvancedQuery(rows, "broker!=BPML").map((r) => r.id)).toEqual(["2"]);
  });

  it("key!:value excludes substring matches", () => {
    expect(filterRowsByAdvancedQuery(rows, "area!:Akmeemana").map((r) => r.id)).toEqual(["3"]);
  });

  it("negation ANDs with everything else", () => {
    expect(filterRowsByAdvancedQuery(rows, "broker:BPML netKg!=120").map((r) => r.id)).toEqual(["3"]);
  });

  it("!= is not misread as a key ending in ! — the longer operator wins", () => {
    // A key`!`, op `=`, value `BPML` would match nothing and quietly return all
    // rows as free text instead of excluding.
    expect(filterRowsByAdvancedQuery(rows, "broker!=BPML")).toHaveLength(1);
  });

  it("booleans negate on the same Yes/No the column renders", () => {
    const flagged = [{ id: "1", unsold: true }, { id: "2", unsold: false }];
    expect(filterRowsByAdvancedQuery(flagged, "unsold!=Yes").map((r) => r.id)).toEqual(["2"]);
    expect(filterRowsByAdvancedQuery(flagged, "unsold=Yes").map((r) => r.id)).toEqual(["1"]);
  });
});

describe("splitPage", () => {
  it("reports hasMore and trims the probe row when a further page exists", () => {
    const page = splitPage([1, 2, 3, 4], 3);
    expect(page.rows).toEqual([1, 2, 3]);
    expect(page.hasMore).toBe(true);
  });

  it("reports no further page when the result fits", () => {
    const page = splitPage([1, 2], 3);
    expect(page.rows).toEqual([1, 2]);
    expect(page.hasMore).toBe(false);
  });
});
