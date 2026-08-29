import { describe, expect, it } from "vitest";
import { hasOrBranches, splitAdvancedQueryGroups } from "../list-query-groups";
import { filterRowsByAdvancedQuery } from "../list-search-query";

describe("splitAdvancedQueryGroups", () => {
  it("treats whitespace and & as the same AND", () => {
    expect(splitAdvancedQueryGroups("a b")).toEqual(["a b"]);
    expect(splitAdvancedQueryGroups("a & b")).toEqual(["a b"]);
    expect(splitAdvancedQueryGroups("a&b")).toEqual(["a b"]);
  });

  it("splits OR branches on |", () => {
    expect(splitAdvancedQueryGroups("a | b")).toEqual(["a", "b"]);
    expect(splitAdvancedQueryGroups("a|b|c")).toEqual(["a", "b", "c"]);
  });

  it("binds & tighter than |, as SQL does", () => {
    // a & b | c  ==  (a AND b) OR c
    expect(splitAdvancedQueryGroups("a & b | c")).toEqual(["a b", "c"]);
    expect(splitAdvancedQueryGroups("a | b & c")).toEqual(["a", "b c"]);
  });

  it("ignores & and | inside quotes — they are part of the value", () => {
    expect(splitAdvancedQueryGroups('buyer:"Smith & Sons"')).toEqual(['buyer:"Smith & Sons"']);
    expect(splitAdvancedQueryGroups('note:"a|b"')).toEqual(['note:"a|b"']);
  });

  it("drops empty branches rather than matching everything", () => {
    expect(splitAdvancedQueryGroups("a ||  | b")).toEqual(["a", "b"]);
    expect(splitAdvancedQueryGroups("")).toEqual([]);
    expect(splitAdvancedQueryGroups(null)).toEqual([]);
  });

  it("reports whether a query needs OR handling", () => {
    expect(hasOrBranches("a b")).toBe(false);
    expect(hasOrBranches("a | b")).toBe(true);
    expect(hasOrBranches('buyer:"Smith & Sons"')).toBe(false);
  });
});

describe("filtering with & and |", () => {
  const rows = [
    { id: "1", state: "Sold", broker: "BPML", netKg: 120 },
    { id: "2", state: "Valued", broker: "BPML", netKg: 80 },
    { id: "3", state: "Valued", broker: "ASIA SIYAKA", netKg: 200 },
    { id: "4", state: "Invoiced", broker: "ASIA SIYAKA", netKg: 40 },
  ];

  it("& behaves exactly like a space", () => {
    expect(filterRowsByAdvancedQuery(rows, "state:Valued & broker:BPML").map((r) => r.id)).toEqual(["2"]);
    expect(filterRowsByAdvancedQuery(rows, "state:Valued broker:BPML").map((r) => r.id)).toEqual(["2"]);
  });

  it("| returns rows matching either branch", () => {
    expect(filterRowsByAdvancedQuery(rows, "state:Sold | state:Invoiced").map((r) => r.id)).toEqual(["1", "4"]);
  });

  it("(a AND b) OR c — & binds tighter", () => {
    expect(filterRowsByAdvancedQuery(rows, "state:Valued & broker:BPML | netKg>150").map((r) => r.id))
      .toEqual(["2", "3"]);
  });

  it("combines with negation", () => {
    expect(filterRowsByAdvancedQuery(rows, "state!=Sold & netKg<100 | broker:ASIA").map((r) => r.id))
      .toEqual(["2", "3", "4"]);
  });

  it("a row is never returned twice, whatever branches it matches", () => {
    expect(filterRowsByAdvancedQuery(rows, "broker:BPML | state:Sold").map((r) => r.id)).toEqual(["1", "2"]);
  });
});
