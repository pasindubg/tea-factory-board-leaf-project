"use client";

import { Children, useCallback, useEffect, useId, useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";

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
  // When true (default), the search panel shows a LOV <select> for this
  // column populated from the data. Set to false for free-text/numeric
  // columns — they'll render as a text/date/number <input> instead.
  lov?: boolean;
  searchInput?: "text" | "date" | "number";
  // Fixed list of options for a "select" filter (label may differ from the
  // raw value, e.g. status codes). If omitted, options are derived from the
  // unique values `accessor` returns across the current rows (the "LOV").
  filterOptions?: { value: string; label: string }[];
};

export type ListSelectionMode = "multi" | "single";

/**
 * Declarative contract shared by operational tables and side-panel lists.
 * Screens can keep their domain-specific rendering while using one consistent
 * definition for searchable columns, selection behavior, editability, and
 * command availability.
 */
export type ListDefinition<T> = {
  columns: ColumnDef<T>[];
  selectionMode?: ListSelectionMode;
  editable?: boolean;
  commands?: { id: string; label: string; requiresSelection?: boolean; destructive?: boolean }[];
};

export type ListTab = {
  id: string;
  label: string;
  count?: string;
};

/** A reusable top-navigation tab bar for related list work surfaces. The
 * individual tables keep their own controls while the user sees one focused
 * list area at a time. */
export function TabbedListSurface({ tabs, children, defaultTab }: { tabs: ListTab[]; children: ReactNode; defaultTab?: string }) {
  const panels = Children.toArray(children);
  const firstTab = tabs[0]?.id ?? "list";
  const [activeTab, setActiveTab] = useState(defaultTab && tabs.some((tab) => tab.id === defaultTab) ? defaultTab : firstTab);
  const tabSetId = useId().replace(/:/g, "");
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.id === activeTab));

  function activate(index: number) {
    const tab = tabs[index];
    if (tab) setActiveTab(tab.id);
  }

  return (
    <section className="space-y-3">
      <div role="tablist" aria-label="Sale lists" className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-stone-200 bg-stone-50 p-1.5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        {tabs.map((tab, index) => {
          const selected = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              id={`${tabSetId}-tab-${tab.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${tabSetId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => activate(index)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") activate((index + 1) % tabs.length);
                else if (event.key === "ArrowLeft") activate((index - 1 + tabs.length) % tabs.length);
                else if (event.key === "Home") activate(0);
                else if (event.key === "End") activate(tabs.length - 1);
                else return;
                event.preventDefault();
              }}
              className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                selected
                  ? "bg-white text-green-800 shadow-sm dark:bg-stone-800 dark:text-green-300"
                  : "text-stone-600 hover:bg-white/70 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800/70 dark:hover:text-stone-100"
              }`}
            >
              {tab.label}
              {tab.count && <span className={`rounded-full px-2 py-0.5 text-xs ${selected ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" : "bg-stone-200 text-stone-600 dark:bg-stone-700 dark:text-stone-300"}`}>{tab.count}</span>}
            </button>
          );
        })}
      </div>
      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          id={`${tabSetId}-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`${tabSetId}-tab-${tab.id}`}
          hidden={tab.id !== activeTab}
        >
          {panels[index]}
        </div>
      ))}
    </section>
  );
}

export function ListSelectionHeader({ mode, scope, checked, onChange, disabled = false }: { mode: ListSelectionMode; scope: string; checked?: boolean; onChange?: () => void; disabled?: boolean }) {
  if (mode === "single") return null;
  return <th className="w-12 px-4 py-3"><input type="checkbox" data-select-all={scope} aria-label={`Select all visible ${scope}`} className="list-checkbox" checked={checked} onChange={onChange} disabled={disabled} /></th>;
}

export function ListSelectionCell({ mode, scope, id, label, checked, onChange, disabled = false, name = "selected_ids" }: { mode: ListSelectionMode; scope: string; id: string; label: string; checked?: boolean; onChange?: () => void; disabled?: boolean; name?: string }) {
  if (mode === "single") return null;
  return <td className="w-12 px-4 py-3"><input type="checkbox" name={name} value={id} data-select-row={scope} aria-label={`Select ${label}`} className="list-checkbox" checked={checked} onChange={onChange} disabled={disabled} /></td>;
}

/** Shared controlled selection model. List rows must use `rowProps(id)` so a
 * click anywhere outside an embedded control selects the same item as its
 * checkbox/radio. This prevents pages from implementing subtly different
 * selection rules. */
export function useListSelection<T>(rows: T[], { mode, getId }: { mode: ListSelectionMode; getId: (row: T) => string }) {
  const rowIds = rows.map(getId);
  const rowIdsKey = rowIds.join("\u0001");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const available = new Set(rowIdsKey ? rowIdsKey.split("\u0001") : []);
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => available.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [rowIdsKey]);

  const select = useCallback((id: string) => {
    setSelectedIds((current) => mode === "single" ? new Set([id]) : new Set(current).add(id));
  }, [mode]);

  const toggle = useCallback((id: string) => {
    if (mode === "single") return select(id);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [mode, select]);

  const toggleVisible = useCallback((visibleRows: T[]) => {
    if (mode === "single") return;
    const visibleIds = visibleRows.map(getId);
    setSelectedIds((current) => {
      const everyVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => current.has(id));
      const next = new Set(current);
      for (const id of visibleIds) {
        if (everyVisibleSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, [getId, mode]);

  const rowProps = useCallback((id: string, disabled = false) => ({
    tabIndex: disabled ? -1 : 0,
    "aria-selected": selectedIds.has(id),
    onClick: (event: MouseEvent<HTMLTableRowElement>) => {
      if (disabled || (event.target as HTMLElement).closest("a,button,input,select,textarea,label")) return;
      select(id);
    },
    onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => {
      if (disabled || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      select(id);
    },
  }), [select, selectedIds]);

  return {
    selectedIds,
    selectedId: mode === "single" ? [...selectedIds][0] ?? null : null,
    selectedCount: selectedIds.size,
    isSelected: (id: string) => selectedIds.has(id),
    select,
    toggle,
    toggleVisible,
    clear: () => setSelectedIds(new Set()),
    allVisibleSelected: (visibleRows: T[]) => visibleRows.length > 0 && visibleRows.every((row) => selectedIds.has(getId(row))),
    rowProps,
  };
}

export function ListSelectionSummary({ mode, count = 0 }: { mode: ListSelectionMode; count?: number }) {
  return <p className="text-sm font-medium text-stone-500 dark:text-stone-400" aria-live="polite">{count > 0 ? `${count} selected` : mode === "multi" ? "Select rows to manage records" : "Select one row to manage the record"}</p>;
}

export function ListCommandToolbar({ mode, count = 0, children }: { mode: ListSelectionMode; count?: number; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-4 py-3 dark:border-stone-800"><ListSelectionSummary mode={mode} count={count} /><div className="flex flex-wrap justify-end gap-2">{children}</div></div>;
}

export function ListSurface({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div data-list-surface className={`overflow-hidden rounded-[1.25rem] border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900 ${className}`}>{children}</div>;
}

export function ListSidePanel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <aside data-list-side-panel className={`flex overflow-hidden rounded-[1.5rem] border border-stone-200 bg-white shadow-lg shadow-stone-950/5 dark:border-stone-700 dark:bg-stone-900 dark:shadow-black/20 ${className}`}>{children}</aside>;
}

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
  const [columnSearches, setColumnSearches] = useState<Record<string, string>>({});
  const [appliedColumnSearches, setAppliedColumnSearches] = useState<Record<string, string>>({});
  const [advancedQuery, setAdvancedQuery] = useState("");
  const [appliedAdvancedQuery, setAppliedAdvancedQuery] = useState("");

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
    setAppliedColumnSearches({});
    setAdvancedQuery("");
    setAppliedAdvancedQuery("");
  }

  function applySearch() {
    setAppliedColumnSearches(columnSearches);
    setAppliedAdvancedQuery(advancedQuery);
  }

  const filterCols = useMemo(() => columns.filter((c) => c.filter && c.accessor), [columns]);
  const searchCols = useMemo(() => columns.filter((c) => c.accessor), [columns]);
  const activeColumnSearchCount = searchCols.filter((c) => (appliedColumnSearches[c.key] ?? "").trim() !== "").length;
  const activeFilterCount =
    filterCols.filter((c) => (filters[c.key] ?? "").trim() !== "").length +
    activeColumnSearchCount +
    (appliedAdvancedQuery.trim() ? 1 : 0);

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

    const activeColumnSearches = searchCols.filter((c) => (appliedColumnSearches[c.key] ?? "").trim() !== "");
    if (activeColumnSearches.length > 0) {
      result = result.filter((row) =>
        activeColumnSearches.every((c) => {
          const raw = searchableValue(c.accessor!(row));
          const needle = appliedColumnSearches[c.key]!.toLowerCase();
          // LOV columns: exact match (user picked from a dropdown)
          if (c.lov !== false) return raw === needle;
          // Free-text columns: substring match
          return raw.includes(needle);
        }),
      );
    }

    const advancedTokens = parseAdvancedQuery(appliedAdvancedQuery.trim(), searchCols);
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
  }, [rows, filters, appliedColumnSearches, appliedAdvancedQuery, sort, columns, filterCols, searchCols]);

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
    applySearch,
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
      className="inline-flex min-h-8 items-center gap-1 rounded-lg px-1 hover:text-green-800 dark:hover:text-green-300"
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
  variant?: "inline" | "popover";
}) {
  const searchPanelId = `list-search-${useId().replace(/:/g, "")}`;
  const searchCols = columns.filter((col) => col.accessor);
  if (searchCols.length === 0) return null;

  return (
    <div data-list-search-panel className="border-b border-stone-100 bg-stone-50/70 px-4 py-3 dark:border-stone-800 dark:bg-stone-900/60">
      <div className="flex items-center justify-between gap-3">
        <button type="button" popoverTarget={searchPanelId} popoverTargetAction="toggle" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 shadow-sm hover:bg-green-50 hover:text-green-800 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-green-950">
            {label}
            {controls.activeFilterCount > 0 && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] text-green-800 dark:bg-green-900 dark:text-green-200">{controls.activeFilterCount}</span>}
            <span aria-hidden="true">⌄</span>
        </button>
        <div id={searchPanelId} popover="auto" className="fixed left-1/2 top-16 z-[90] m-0 max-h-[calc(100dvh-5rem)] w-[min(58rem,calc(100vw-2rem))] -translate-x-1/2 overflow-y-auto rounded-[1.75rem] border border-stone-200 bg-white p-5 shadow-2xl backdrop:bg-stone-950/25 dark:border-stone-700 dark:bg-stone-950">
            <div className="mb-4">
              <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">{label} criteria</h3>
              <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Choose LOV values, then select Search to apply them.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={`${label} by column`}>
              {searchCols.map((col) => (
                <label key={col.key} className="grid gap-1.5 text-xs font-semibold text-stone-500 dark:text-stone-400">
                  {col.label}
                  <ColumnSearchInput col={col} controls={controls} />
                </label>
              ))}
              <details className="group sm:col-span-2 lg:col-span-3">
                <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1 rounded-full border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-800 [&::-webkit-details-marker]:hidden">
                  Advanced <span aria-hidden="true">⌄</span>
                </summary>
                <div className="mt-3 rounded-2xl bg-stone-50 p-4 dark:bg-stone-900">
                  <label className="grid gap-2 text-xs font-semibold text-stone-500 dark:text-stone-400">
                    Advanced query
                    <input value={controls.advancedQuery} onChange={(event) => controls.setAdvancedQuery(event.target.value)} placeholder='broker:BPML netKg>100 saleNo:019 "Galle"' className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-normal text-stone-800 outline-none focus:border-green-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100" />
                  </label>
                </div>
              </details>
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t border-stone-100 pt-4 dark:border-stone-800">
              <button
                type="button"
                popoverTarget={searchPanelId}
                popoverTargetAction="hide"
                onClick={() => {
                  controls.clearFilters();
                }}
                className="min-h-10 rounded-full px-4 text-sm font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
              >Clear</button>
              <button
                type="button"
                data-list-search-apply
                popoverTarget={searchPanelId}
                popoverTargetAction="hide"
                onClick={() => {
                  controls.applySearch();
                }}
                className="min-h-10 rounded-full bg-green-700 px-5 text-sm font-semibold text-white shadow-sm hover:bg-green-800 dark:bg-green-500 dark:text-green-950 dark:hover:bg-green-400"
              >Search</button>
            </div>
        </div>
        {controls.activeFilterCount > 0 && (
          <button type="button" onClick={controls.clearFilters} className="min-h-9 rounded-full px-3 text-xs text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800">Clear search</button>
        )}
      </div>
    </div>
  );
}

function ColumnSearchInput<T>({ col, controls }: { col: ColumnDef<T>; controls: ListControls<T> }) {
  const value = controls.columnSearches[col.key] ?? "";
  // Non-LOV columns: render a text input
  if (col.lov === false) {
    const inputType = col.searchInput ?? "text";
    return (
      <input
        type={inputType}
        value={value}
        onChange={(event) => controls.setColumnSearch(col.key, event.target.value)}
        placeholder={inputType === "date" ? undefined : `Search ${col.label.toLowerCase()}`}
        className="min-h-10 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-normal text-stone-800 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
      />
    );
  }
  // LOV columns (default): render a select dropdown
  return (
    <select
      data-list-lov
      value={value}
      onChange={(event) => controls.setColumnSearch(col.key, event.target.value)}
      className="min-h-10 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-normal text-stone-800 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
    >
      <option value="">All {col.label}</option>
      {controls.optionsFor(col).map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

/**
 * Wires a "select all" checkbox (identified by data-select-all="<scope>")
 * to every row checkbox (data-select-row="<scope>"). Also keeps the
 * select-all checkbox in sync when rows are toggled individually.
 *
 * Usage: call `useCheckboxSync(formRef, "myScope")` inside a client
 * component whose <form> (or wrapper <div>) has a ref, then add
 * data-select-all="myScope" on the header checkbox and
 * data-select-row="myScope" on each row checkbox.
 */
export function useCheckboxSync(formRef: React.RefObject<HTMLFormElement | null>, scope: string) {
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    function collect() {
      const all = form!.querySelector<HTMLInputElement>(`input[type="checkbox"][data-select-all="${scope}"]`);
      const rows = [...form!.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][data-select-row="${scope}"]`)];
      return { all, rows };
    }

    function syncSelectAll() {
      const { all, rows } = collect();
      if (!all || rows.length === 0) return;
      all.checked = rows.every((cb) => cb.checked);
      all.indeterminate = !all.checked && rows.some((cb) => cb.checked);
    }

    function handleChange(e: Event) {
      const target = e.target as HTMLInputElement;
      if (target.type !== "checkbox") return;
      if (target.dataset.selectAll === scope) {
        const checked = target.checked;
        const { rows } = collect();
        for (const cb of rows) cb.checked = checked;
      } else if (target.dataset.selectRow === scope) {
        syncSelectAll();
      }
    }

    form.addEventListener("change", handleChange);

    // Re-sync after DOM mutations (e.g., search filtering changes visible rows)
    const observer = new MutationObserver(() => syncSelectAll());
    observer.observe(form, { childList: true, subtree: true });

    // Initial sync
    syncSelectAll();

    return () => {
      form.removeEventListener("change", handleChange);
      observer.disconnect();
    };
  }, [formRef, scope]);
}
