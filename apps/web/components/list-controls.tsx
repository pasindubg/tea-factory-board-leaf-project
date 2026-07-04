"use client";

import { useMemo, useState } from "react";

// Shared column-sort + column-filter primitives for the app's hand-rolled
// tables. Deliberately headless: each table keeps its own <table> markup,
// row editing, and selection state — this only supplies the "which rows,
// in what order" logic plus small drop-in header controls, so adopting it
// doesn't require rewriting any table's existing behavior.

export type ColumnDef<T> = {
  key: string;
  label: string;
  // Value used for sorting and filtering. Omit for action/checkbox columns
  // that are neither sortable nor filterable.
  accessor?: (row: T) => string | number | null | undefined;
  sortable?: boolean;
  filter?: "text" | "select";
  // Fixed list of options for a "select" filter (label may differ from the
  // raw value, e.g. status codes). If omitted, options are derived from the
  // unique values `accessor` returns across the current rows (the "LOV").
  filterOptions?: { value: string; label: string }[];
};

type SortState = { key: string; dir: "asc" | "desc" } | null;

function compareValues(a: string | number | null | undefined, b: string | number | null | undefined): number {
  const aEmpty = a == null || a === "";
  const bEmpty = b == null || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1; // empty/null always sorts last
  if (bEmpty) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

export function useListControls<T>(rows: T[], columns: ColumnDef<T>[]) {
  const [sort, setSort] = useState<SortState>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});

  function toggleSort(key: string) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  function setFilter(key: string, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function clearFilters() {
    setFilters({});
  }

  const filterCols = useMemo(() => columns.filter((c) => c.filter && c.accessor), [columns]);
  const activeFilterCount = filterCols.filter((c) => (filters[c.key] ?? "").trim() !== "").length;

  const visibleRows = useMemo(() => {
    let result = rows;

    const activeCols = filterCols.filter((c) => (filters[c.key] ?? "").trim() !== "");
    if (activeCols.length > 0) {
      result = result.filter((row) =>
        activeCols.every((c) => {
          const raw = c.accessor!(row);
          const needle = filters[c.key]!;
          if (c.filter === "select") return String(raw ?? "") === needle;
          return String(raw ?? "").toLowerCase().includes(needle.toLowerCase());
        }),
      );
    }

    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col?.accessor) {
        const dir = sort.dir === "asc" ? 1 : -1;
        const accessor = col.accessor;
        result = [...result].sort((ra, rb) => compareValues(accessor(ra), accessor(rb)) * dir);
      }
    }

    return result;
  }, [rows, filters, sort, columns, filterCols]);

  function optionsFor(col: ColumnDef<T>): { value: string; label: string }[] {
    if (col.filterOptions) return col.filterOptions;
    if (!col.accessor) return [];
    const seen = new Set<string>();
    for (const row of rows) {
      const v = col.accessor(row);
      if (v != null && String(v).trim() !== "") seen.add(String(v));
    }
    return [...seen].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((value) => ({ value, label: value }));
  }

  return { rows: visibleRows, sort, toggleSort, filters, setFilter, clearFilters, hasFilters: filterCols.length > 0, activeFilterCount, optionsFor };
}

export type ListControls<T> = ReturnType<typeof useListControls<T>>;

// Drop into an existing <th>: renders the label as a clickable sort toggle
// with a direction arrow when this column is the active sort. For columns
// that aren't sortable, just render the label directly instead of using this.
export function SortButton<T>({ col, controls }: { col: ColumnDef<T>; controls: ListControls<T> }) {
  const active = controls.sort?.key === col.key;
  return (
    <button
      type="button"
      onClick={() => controls.toggleSort(col.key)}
      className="inline-flex items-center gap-1 hover:text-stone-700 dark:hover:text-stone-200"
    >
      {col.label}
      <SortIcon dir={active ? controls.sort!.dir : null} />
    </button>
  );
}

function SortIcon({ dir }: { dir: "asc" | "desc" | null }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`h-3 w-3 ${dir ? "" : "opacity-30"}`}>
      {dir === "desc" ? (
        <path fillRule="evenodd" d="M10 3a.75.75 0 0 1 .75.75v10.638l3.96-4.158a.75.75 0 1 1 1.08 1.04l-5.25 5.5a.75.75 0 0 1-1.08 0l-5.25-5.5a.75.75 0 1 1 1.08-1.04l3.96 4.158V3.75A.75.75 0 0 1 10 3Z" clipRule="evenodd" />
      ) : (
        <path fillRule="evenodd" d="M10 17a.75.75 0 0 1-.75-.75V5.612L5.29 9.77a.75.75 0 0 1-1.08-1.04l5.25-5.5a.75.75 0 0 1 1.08 0l5.25 5.5a.75.75 0 1 1-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0 1 10 17Z" clipRule="evenodd" />
      )}
    </svg>
  );
}

// Drop into a <th> in a dedicated filter row placed right under the header
// row. Renders a text box or a select (populated from filterOptions or the
// data-derived LOV) depending on the column's filter type.
export function FilterCell<T>({ col, controls }: { col: ColumnDef<T>; controls: ListControls<T> }) {
  if (!col.filter || !col.accessor) return null;
  const value = controls.filters[col.key] ?? "";
  if (col.filter === "select") {
    return (
      <select
        value={value}
        onChange={(e) => controls.setFilter(col.key, e.target.value)}
        className="w-full rounded border border-stone-200 bg-white px-1.5 py-1 text-xs dark:border-stone-700 dark:bg-stone-800"
      >
        <option value="">All</option>
        {controls.optionsFor(col).map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }
  return (
    <input
      value={value}
      onChange={(e) => controls.setFilter(col.key, e.target.value)}
      placeholder={`Search ${col.label.toLowerCase()}…`}
      className="w-full min-w-[6rem] rounded border border-stone-200 bg-white px-2 py-1 text-xs dark:border-stone-700 dark:bg-stone-800"
    />
  );
}
