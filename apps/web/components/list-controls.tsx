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
  searchInput?: "text" | "date" | "number";
  // Fixed list of options for a "select" filter (label may differ from the
  // raw value, e.g. status codes). If omitted, options are derived from the
  // unique values `accessor` returns across the current rows (the "LOV").
  filterOptions?: { value: string; label: string }[];
};

type SortState = { key: string; dir: "asc" | "desc" } | null;
type SearchOperator = ":" | "=" | ">" | ">=" | "<" | "<=";
type SearchToken<T> =
  | { kind: "free"; value: string }
  | { kind: "column"; col: ColumnDef<T>; op: SearchOperator; value: string };

function compareValues(a: string | number | null | undefined, b: string | number | null | undefined): number {
  const aEmpty = a == null || a === "";
  const bEmpty = b == null || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1; // empty/null always sorts last
  if (bEmpty) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function searchableValue(value: string | number | null | undefined) {
  return String(value ?? "").toLowerCase();
}

function normalizeSearchKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function tokeniseQuery(query: string) {
  return query.match(/"[^"]+"|\S+/g)?.map((token) => token.replace(/^"|"$/g, "")) ?? [];
}

function comparableNumber(value: string | number | null | undefined) {
  if (typeof value === "number") return value;
  const text = String(value ?? "").trim();
  if (!text) return Number.NaN;
  const date = Date.parse(text);
  if (!Number.isNaN(date) && /\d{4}-\d{1,2}-\d{1,2}/.test(text)) return date;
  return Number(text.replace(/,/g, ""));
}

function parseAdvancedQuery<T>(query: string, columns: ColumnDef<T>[]): SearchToken<T>[] {
  const columnByKey = new Map<string, ColumnDef<T>>();
  for (const col of columns.filter((c) => c.accessor)) {
    columnByKey.set(normalizeSearchKey(col.key), col);
    columnByKey.set(normalizeSearchKey(col.label), col);
  }

  return tokeniseQuery(query).map((token) => {
    const match = token.match(/^([^:<>!=]+)(>=|<=|=|>|<|:)(.+)$/);
    if (!match) return { kind: "free", value: token } satisfies SearchToken<T>;
    const [, key, op, value] = match;
    const col = columnByKey.get(normalizeSearchKey(key));
    if (!col) return { kind: "free", value: token } satisfies SearchToken<T>;
    return { kind: "column", col, op: op as SearchOperator, value };
  });
}

function matchesAdvancedToken<T>(row: T, token: SearchToken<T>, searchCols: ColumnDef<T>[]) {
  if (token.kind === "free") {
    const needle = token.value.toLowerCase();
    return searchCols.some((col) => searchableValue(col.accessor!(row)).includes(needle));
  }

  const raw = token.col.accessor!(row);
  if (token.op === ":") return searchableValue(raw).includes(token.value.toLowerCase());
  if (token.op === "=") return searchableValue(raw) === token.value.toLowerCase();

  const left = comparableNumber(raw);
  const right = comparableNumber(token.value);
  if (Number.isNaN(left) || Number.isNaN(right)) return false;
  if (token.op === ">") return left > right;
  if (token.op === ">=") return left >= right;
  if (token.op === "<") return left < right;
  return left <= right;
}

export function useListControls<T>(rows: T[], columns: ColumnDef<T>[]) {
  const [sort, setSort] = useState<SortState>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [columnSearches, setColumnSearches] = useState<Record<string, string>>({});
  const [advancedQuery, setAdvancedQuery] = useState("");

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

  function setColumnSearch(key: string, value: string) {
    setColumnSearches((prev) => ({ ...prev, [key]: value }));
  }

  function clearFilters() {
    setFilters({});
    setColumnSearches({});
    setAdvancedQuery("");
  }

  const filterCols = useMemo(() => columns.filter((c) => c.filter && c.accessor), [columns]);
  const searchCols = useMemo(() => columns.filter((c) => c.accessor), [columns]);
  const activeColumnSearchCount = searchCols.filter((c) => (columnSearches[c.key] ?? "").trim() !== "").length;
  const activeFilterCount =
    filterCols.filter((c) => (filters[c.key] ?? "").trim() !== "").length +
    activeColumnSearchCount +
    (advancedQuery.trim() ? 1 : 0);

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

    const activeColumnSearches = searchCols.filter((c) => (columnSearches[c.key] ?? "").trim() !== "");
    if (activeColumnSearches.length > 0) {
      result = result.filter((row) =>
        activeColumnSearches.every((c) => searchableValue(c.accessor!(row)).includes(columnSearches[c.key]!.toLowerCase())),
      );
    }

    const advancedTokens = parseAdvancedQuery(advancedQuery.trim(), searchCols);
    if (advancedTokens.length > 0) {
      result = result.filter((row) => advancedTokens.every((token) => matchesAdvancedToken(row, token, searchCols)));
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
  }, [rows, filters, columnSearches, advancedQuery, sort, columns, filterCols, searchCols]);

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

  return {
    rows: visibleRows,
    sort,
    toggleSort,
    filters,
    setFilter,
    columnSearches,
    setColumnSearch,
    advancedQuery,
    setAdvancedQuery,
    searchOpen,
    setSearchOpen,
    clearFilters,
    hasFilters: filterCols.length > 0,
    hasSearchableColumns: searchCols.length > 0,
    activeFilterCount,
    optionsFor,
  };
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

export function ListSearchPanel<T>({
  columns,
  controls,
  label = "Search",
}: {
  columns: ColumnDef<T>[];
  controls: ListControls<T>;
  label?: string;
}) {
  const searchCols = columns.filter((col) => col.accessor);
  if (searchCols.length === 0) return null;

  return (
    <div className="border-b border-stone-100 bg-stone-50/70 px-4 py-3 dark:border-stone-800 dark:bg-stone-900/60">
      <div className="flex items-center justify-end gap-2">
        {controls.activeFilterCount > 0 && (
          <span className="text-xs text-stone-500 dark:text-stone-400">
            {controls.activeFilterCount} active
          </span>
        )}
        <button
          type="button"
          onClick={() => controls.setSearchOpen(!controls.searchOpen)}
          className="inline-flex items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
        >
          <SearchIcon />
          {label}
        </button>
        {controls.activeFilterCount > 0 && (
          <button
            type="button"
            onClick={controls.clearFilters}
            className="rounded-md px-2.5 py-1.5 text-xs text-stone-500 hover:bg-stone-100 hover:text-stone-700 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
          >
            Clear
          </button>
        )}
      </div>
      {controls.searchOpen && (
        <div className="mt-3 grid gap-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {searchCols.map((col) => (
              <label key={col.key} className="grid gap-1 text-xs font-medium text-stone-500 dark:text-stone-400">
                {col.label}
                <ColumnSearchInput col={col} controls={controls} />
              </label>
            ))}
          </div>
          <label className="grid gap-1 text-xs font-medium text-stone-500 dark:text-stone-400">
            Advanced search
            <input
              value={controls.advancedQuery}
              onChange={(event) => controls.setAdvancedQuery(event.target.value)}
              placeholder='broker:BPML netKg>100 saleNo:0019 "Galle"'
              className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-normal text-stone-800 outline-none focus:border-green-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
            />
          </label>
          <p className="text-xs text-stone-400 dark:text-stone-500">
            Use free text across all columns, or column queries with <span className="font-mono">:</span>, <span className="font-mono">=</span>, <span className="font-mono">&gt;</span>, <span className="font-mono">&gt;=</span>, <span className="font-mono">&lt;</span>, <span className="font-mono">&lt;=</span>.
          </p>
        </div>
      )}
    </div>
  );
}

function ColumnSearchInput<T>({ col, controls }: { col: ColumnDef<T>; controls: ListControls<T> }) {
  const value = controls.columnSearches[col.key] ?? "";
  if (col.filter === "select") {
    return (
      <select
        value={value}
        onChange={(event) => controls.setColumnSearch(col.key, event.target.value)}
        className="w-full rounded-md border border-stone-200 bg-white px-2 py-1.5 text-sm font-normal text-stone-800 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
      >
        <option value="">All</option>
        {controls.optionsFor(col).map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    );
  }
  const inputType = col.searchInput ?? "text";
  return (
    <input
      type={inputType}
      value={value}
      onChange={(event) => controls.setColumnSearch(col.key, event.target.value)}
      placeholder={inputType === "date" ? undefined : `Search ${col.label.toLowerCase()}`}
      className="w-full rounded-md border border-stone-200 bg-white px-2 py-1.5 text-sm font-normal text-stone-800 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
    />
  );
}

function SearchIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 3.473 9.766l2.63 2.63a.75.75 0 1 0 1.06-1.06l-2.63-2.63A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0A4 4 0 0 1 5 9Z" clipRule="evenodd" />
    </svg>
  );
}
