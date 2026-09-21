import { describe, expect, it } from "vitest";
import { listViewStorageKey, parseListViewPreferences, resolveListFields } from "../list-view-preferences";

const columns = [{ key: "name" }, { key: "weight" }, { key: "amount" }];

describe("per-user list field preferences", () => {
  it("round-trips mode, keyed widths, order and hidden fields across sessions", () => {
    const saved = { mode: "table", widths: { amount: 220 }, order: ["amount", "name", "weight"], hidden: ["weight"] };
    expect(parseListViewPreferences(JSON.stringify(saved))).toEqual(saved);
    expect(resolveListFields(columns, parseListViewPreferences(JSON.stringify(saved))).visible).toEqual([columns[2], columns[0]]);
  });

  it("isolates each account, factory, list and tab without ambiguous key concatenation", () => {
    const keys = [
      listViewStorageKey("a", "f", "sales"), listViewStorageKey("b", "f", "sales"),
      listViewStorageKey("a", "g", "sales"), listViewStorageKey("a", "f", "lots"),
      listViewStorageKey("a", "f", "sales-paid"),
      listViewStorageKey("a:b", "f", "c"), listViewStorageKey("a", "f", "b:c"),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("ignores removed or duplicate fields, appends newly added fields visibly", () => {
    const result = resolveListFields(columns, { order: ["amount", "deleted", "amount"], hidden: ["name", "deleted"] });
    expect(result.ordered.map((column) => column.key)).toEqual(["amount", "name", "weight"]);
    expect(result.visible.map((column) => column.key)).toEqual(["amount", "weight"]);
  });

  it("retains one visible field even when a stale preference hides everything", () => {
    expect(resolveListFields(columns, { order: ["amount"], hidden: columns.map((column) => column.key) }).visible).toEqual([columns[2]]);
    expect(resolveListFields([], { order: ["gone"], hidden: [] }).visible).toEqual([]);
  });

  it("resets to original field order and visibility without mutating definitions", () => {
    const before = structuredClone(columns);
    resolveListFields(columns, { order: ["amount"], hidden: ["name"] });
    expect(resolveListFields(columns, { order: [], hidden: [] }).visible).toEqual(before);
    expect(columns).toEqual(before);
  });

  it("keeps all positional create/edit inputs and restores preferences when editing ends", () => {
    const saved = { order: ["amount", "name"], hidden: ["weight"] };
    expect(resolveListFields(columns, saved, true).visible).toEqual(columns);
    expect(resolveListFields(columns, saved, false).visible).toEqual([columns[2], columns[0]]);
    expect(saved).toEqual({ order: ["amount", "name"], hidden: ["weight"] });
  });

  it("tolerates malformed storage and rejects invalid widths and field keys", () => {
    for (const raw of [null, "{broken", "null", "false", "7"]) {
      expect(parseListViewPreferences(raw)).toEqual({ mode: "list", widths: {}, order: [], hidden: [] });
    }
    expect(parseListViewPreferences(JSON.stringify({ mode: "bad", widths: { name: -1, weight: "100", amount: 120 }, order: ["name", 3, "name"], hidden: {} })))
      .toEqual({ mode: "list", widths: { amount: 120 }, order: ["name"], hidden: [] });
  });
});
