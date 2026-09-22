import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { filterRowsByAdvancedQuery } from "../list-search-query";

const query = "lot_source!=acknowledgement";
const rows = [
  { id: "ack", lot_source: "acknowledgement", grade: "BOP" },
  { id: "factory", lot_source: "factory", grade: "BOP" },
  { id: "legacy", lot_source: null, grade: "BOP" },
  { id: "other-grade", lot_source: "factory", grade: "PEKO" },
];

describe("dispatch lot origin search", () => {
  it("excludes only ACK-origin lots and retains legacy null origins", () => {
    expect(filterRowsByAdvancedQuery(rows, query).map((r) => r.id)).toEqual(["factory", "legacy", "other-grade"]);
  });
  it("combines with existing search criteria without modifying rows", () => {
    const before = structuredClone(rows);
    expect(filterRowsByAdvancedQuery(rows, `grade=BOP & ${query}`).map((r) => r.id)).toEqual(["factory", "legacy"]);
    expect(rows).toEqual(before);
    expect(filterRowsByAdvancedQuery(rows, "")).toEqual(rows);
  });
  it("declares the toggle and search-only field on the shared list", () => {
    const source = readFileSync(new URL("../../app/dashboard/auction/[saleId]/dispatched-lots-table.tsx", import.meta.url), "utf8");
    expect(source).toContain(`query: "${query}"`);
    expect(source).toMatch(/key: "lot_source",[\s\S]*?searchOnly: true/);
  });
});
