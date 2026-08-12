"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { FrameworkList, TabView, type FrameworkListProps } from "@tea/ui";
import { showAppToast } from "@/components/action-feedback";
import { LovCombobox } from "@/components/lov-combobox";
import type { LovSourceKey } from "@/lib/list-lov";
import { refreshListResource } from "@/lib/list-resource-action";
import { listLockableRoles, removeListSearchLock, saveListSearchLock, saveListSearchState } from "@/lib/list-search-actions";
import type { Role } from "@/lib/roles";
import type { ListMutationResult, ListRefreshResult } from "@/lib/list-mutations";
import { listResourceIdentity, type ListInvalidation, type ListResourceKey, type ListResourceRequest, type ListResourceRow, type ListResourceSearch } from "@/lib/list-resources";

// Deliberately excludes "manager" (and "owner"): both are always exempt from
// locks (see resolveListSearchState), so offering them here would let an
// owner/manager "lock" a role for which the lock silently never applies.
const LOCKABLE_ROLES: readonly Role[] = ["supervisor", "accountant", "collector"];

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
  /**
   * Opts this column's search field into the server-querying LOV combobox
   * instead of the data-derived datalist. Prefer it for any column whose
   * values live in a growing reference table: the datalist can only offer
   * values present in the rows already loaded, so on a paginated list it
   * silently omits everything past the current page.
   */
  lovSource?: LovSourceKey;
  /**
   * Form field name an inline LOV editor submits. Defaults to the column key,
   * which is right whenever the column already IS the stored field (`grade`).
   * Declare it when they differ (`sellingMark` displayed, `selling_mark_id`
   * stored).
   */
  lovName?: string;
  /**
   * Opts this column into the framework's inline LOV editor.
   *
   * Separate from `lovSource` on purpose: a column often declares a source
   * purely so its SEARCH field offers the full set, while the value itself is
   * not editable on that list — the broker and selling mark shown against a
   * lot belong to its parent broker invoice, not the lot. Rendering an editor
   * for those produced a field name the save action does not read, so the
   * typed value was silently dropped and the cell snapped back on refresh.
   * Set this only when the list's own save action consumes `lovName`/`key`.
   */
  lovEdit?: boolean;
  /**
   * The STORED value behind the displayed label, for LOVs holding a record id
   * (the accessor shows "MF1530 — KUMUDU"; the field must submit its uuid).
   * Omit for code-valued LOVs, where the label is the value.
   */
  lovValue?: (row: T) => string | null | undefined;
  /**
   * Narrowest width (px) this column is still readable at. List mode drops
   * columns that no longer fit within it, and table mode uses it as the
   * starting width and the floor when dragging. Defaults to
   * DEFAULT_COLUMN_MIN_WIDTH; give a number column a smaller one so it does
   * not push a more important column off screen.
   */
  minWidth?: number;
  searchInput?: "text" | "date" | "number";
  // Fixed list of options for a "select" filter (label may differ from the
  // raw value, e.g. status codes). If omitted, options are derived from the
  // unique values `accessor` returns across the current rows (the "LOV").
  filterOptions?: { value: string; label: string }[];
};

/**
 * `filterOptions` for a column that shows a fixed set of raw values.
 *
 * Always declare these on a state/status column. A select column with no
 * declared options can only offer the values found in the rows already
 * loaded, so any state nobody currently sits in silently becomes
 * unsearchable — the bug this exists to prevent.
 */
export function enumFilterOptions(values: readonly string[]): { value: string; label: string }[] {
  return values.map((value) => ({ value, label: value }));
}

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
  /** CRUD commands are independently opt-in. A disabled command is not rendered. */
  add?: boolean;
  edit?: boolean;
  delete?: boolean;
  commands?: { id: string; label: string; requiresSelection?: boolean; destructive?: boolean }[];
};

export type ListTab = {
  id: string;
  label: string;
  count?: string;
};

type ListMutationOptions = {
  notice?: string;
  onSuccess?: () => void;
};

type ListResourceListener = () => Promise<boolean>;
const listResourceListeners = new Map<string, Set<ListResourceListener>>();

function subscribeToListResource(identity: string, listener: ListResourceListener) {
  const listeners = listResourceListeners.get(identity) ?? new Set<ListResourceListener>();
  listeners.add(listener);
  listResourceListeners.set(identity, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) listResourceListeners.delete(identity);
  };
}

async function refreshOtherListInstances(
  resource: ListResourceRequest,
  source?: ListResourceListener,
) {
  const listeners = listResourceListeners.get(listResourceIdentity(resource));
  if (!listeners) return;
  await Promise.all([...listeners].filter((listener) => listener !== source).map((listener) => listener()));
}

async function refreshInvalidatedListInstances(invalidation: ListInvalidation) {
  if (invalidation.kind === "exact") {
    await refreshOtherListInstances(invalidation.resource);
    return;
  }
  const matchingListeners = [...listResourceListeners.entries()]
    .filter(([identity]) => identity === invalidation.key || identity.startsWith(`${invalidation.key}?`))
    .flatMap(([, listeners]) => [...listeners]);
  await Promise.all([...new Set(matchingListeners)].map((listener) => listener()));
}

export type FrameworkListSearchState = {
  saved: Record<string, string> | null;
  savedAdvancedQuery: string | null;
  locked: Record<string, string>;
  /** A locked role's mandatory advanced-query prefix, ANDed in server-side
   * regardless of what the client sends — never merged into the editable
   * advancedQuery input, only shown alongside it (see ListSearchPanel). */
  lockedAdvancedQuery: string | null;
  canManageLocks: boolean;
};

/**
 * Owns the live rows for one framework list. After a successful mutation it
 * asks the central server registry for this allowlisted resource and replaces
 * only subscribed list instances; it never reloads the browser or refreshes
 * the route tree.
 *
 * Also owns server-driven search/pagination: `applySearch` re-executes a real
 * query with the given criteria (replacing rows, resetting to page one) and
 * `loadMore` fetches the next page (appending rows) — both generic, driven
 * entirely by `hasMore`/pagination metadata the registry already returns.
 * Resources that don't declare a `search` config just always report
 * `hasMore: false`, so "Show more" never appears for them — no special-casing
 * needed here.
 */
export function useFrameworkListData<Key extends ListResourceKey>(
  { initialRows, resource }: { initialRows: ListResourceRow<Key>[]; resource: ListResourceRequest<Key> },
) {
  const [rows, setRows] = useState(initialRows);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  // Starts undefined (not a placeholder object) so the seeding effect in
  // useListControls waits for the real fetch below instead of "seeding" once
  // from empty data and never applying the actual saved criteria that arrive
  // moments later — that was silently dropping restored search filters on
  // every fresh mount (refresh/re-login) even though the rows came back
  // correctly filtered server-side.
  const [searchState, setSearchState] = useState<FrameworkListSearchState | undefined>(undefined);
  const identity = listResourceIdentity(resource);
  const resourceRef = useRef(resource);
  const refreshGeneration = useRef(0);
  const lastSearchRef = useRef<ListResourceSearch | undefined>(undefined);
  resourceRef.current = resource;

  // Re-seed `rows` from the server-rendered `initialRows` only when this is
  // genuinely a different resource (identity changed) — not on every parent
  // re-render that merely hands down a new `initialRows` array reference (an
  // unrelated revalidatePath elsewhere on the page, a Fast Refresh, etc.).
  // Once mounted for a given identity, `refresh()` below is the sole source
  // of truth for this list; re-syncing from server props on every render
  // would otherwise let an unrelated re-render blank out fields whenever it
  // lands after a failed mutation, since a failed mutation deliberately does
  // not call refresh() itself (see `mutate`).
  const seededIdentity = useRef<string | null>(null);
  useEffect(() => {
    if (seededIdentity.current === identity) return;
    seededIdentity.current = identity;
    setRows(initialRows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

  const applyResult = useCallback((result: Extract<ListRefreshResult<ListResourceRow<Key>>, { ok: true }>) => {
    setRows(result.rows);
    setHasMore(Boolean(result.hasMore));
    setSearchState({
      saved: result.savedCriteria ?? null,
      savedAdvancedQuery: result.savedAdvancedQuery ?? null,
      locked: result.locked ?? {},
      lockedAdvancedQuery: result.lockedAdvancedQuery ?? null,
      canManageLocks: Boolean(result.canManageLocks),
    });
  }, []);

  const refresh = useCallback(async (search?: ListResourceSearch) => {
    const generation = ++refreshGeneration.current;
    lastSearchRef.current = search;
    setRefreshing(true);
    try {
      const result = await refreshListResource(resourceRef.current, search) as ListRefreshResult<ListResourceRow<Key>>;
      if (!result.ok) {
        if (generation === refreshGeneration.current) showAppToast(result.error, "error");
        return false;
      }
      if (generation === refreshGeneration.current) applyResult(result);
      return true;
    } catch {
      if (generation === refreshGeneration.current) {
        showAppToast("The list changed, but its latest rows could not be loaded. Please try again.", "error");
      }
      return false;
    } finally {
      if (generation === refreshGeneration.current) setRefreshing(false);
    }
  }, [applyResult]);

  // The server-rendered initialRows already reflect saved+locked criteria (the
  // page's own server component calls the same registry loader), but not the
  // hasMore/locked/canManageLocks metadata — one client fetch on mount fills
  // that in without changing what's on screen.
  useEffect(() => { void refresh(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [identity]);

  const refreshWithLastSearch = useCallback(() => refresh(lastSearchRef.current), [refresh]);

  useEffect(() => subscribeToListResource(identity, refreshWithLastSearch), [identity, refreshWithLastSearch]);

  const applySearch = useCallback(async (criteria: Record<string, string>, advancedQuery: string) => {
    void saveListSearchState({ listScope: identity.split("?")[0]!, criteria, advancedQuery: advancedQuery || null });
    return refresh({ criteria, advancedQuery: advancedQuery || null, offset: 0 });
  }, [identity, refresh]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const result = await refreshListResource(resourceRef.current, { ...lastSearchRef.current, offset: rows.length }) as ListRefreshResult<ListResourceRow<Key>>;
      if (!result.ok) {
        showAppToast(result.error, "error");
        return;
      }
      setRows((current) => [...current, ...result.rows]);
      setHasMore(Boolean(result.hasMore));
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, rows.length]);

  const mutate = useCallback(async (
    action: () => Promise<ListMutationResult>,
    options: ListMutationOptions = {},
  ) => {
    try {
      const result = await action();
      if (!result.ok) {
        showAppToast(result.error, "error");
        return false;
      }
      options.onSuccess?.();
      showAppToast(result.notice ?? options.notice ?? "List updated.");
      const refreshed = await refreshWithLastSearch();
      await refreshOtherListInstances(resourceRef.current, refreshWithLastSearch);
      await Promise.all((result.invalidate ?? []).map((invalidation) => refreshInvalidatedListInstances(invalidation)));
      if (!refreshed) return true;
      return true;
    } catch {
      showAppToast("The change could not be saved. Please try again.", "error");
      return false;
    }
  }, [refreshWithLastSearch]);

  const mutationAction = useCallback((
    action: (formData: FormData) => Promise<ListMutationResult>,
    options: ListMutationOptions = {},
  ) => async (formData: FormData) => {
    await mutate(() => action(formData), options);
  }, [mutate]);

  return { rows, refreshing, refresh, mutate, mutationAction, searchState, hasMore, loadingMore, loadMore, applySearch, serverDriven: true as const };
}

/** A reusable top-navigation tab bar for related list work surfaces. The
 * individual tables keep their own controls while the user sees one focused
 * list area at a time. */
export function TabbedListSurface({ tabs, children, defaultTab }: { tabs: ListTab[]; children: ReactNode; defaultTab?: string }) {
  const panels = Array.isArray(children) ? children : [children];
  return <TabView label="Related lists" defaultTabId={defaultTab} tabs={tabs.map((tab, index) => ({ ...tab, badge: tab.count, content: panels[index] ?? null }))} />;
}

export function ListSelectionHeader({ mode, scope, checked, onChange, disabled = false }: { mode: ListSelectionMode; scope: string; checked?: boolean; onChange?: () => void; disabled?: boolean }) {
  if (mode === "single") return null;
  // data-list-selection opts this cell out of the single-line truncation rule:
  // it holds a control, not text, and clipping it renders a stray ellipsis.
  return <th data-list-selection className="w-12 px-3 py-3"><input type="checkbox" data-select-all={scope} aria-label={`Select all visible ${scope}`} className="list-checkbox" checked={checked} onChange={onChange} disabled={disabled} /></th>;
}

export function ListSelectionCell({ mode, scope, id, label, checked, onChange, disabled = false, name = "selected_ids" }: { mode: ListSelectionMode; scope: string; id: string; label: string; checked?: boolean; onChange?: () => void; disabled?: boolean; name?: string }) {
  if (mode === "single") return null;
  return <td data-list-selection className="w-12 px-3 py-3"><input type="checkbox" name={name} value={id} data-select-row={scope} aria-label={`Select ${label}`} className="list-checkbox" checked={checked} onChange={onChange} disabled={disabled} /></td>;
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

export function ListSelectionSummary({ count = 0 }: { count?: number }) {
  if (count === 0) return null;
  return <p className="text-sm font-medium text-stone-500 dark:text-stone-400" aria-live="polite">{`${count} selected`}</p>;
}

type ListHeaderAction = {
  label?: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
};

/** The one action presentation for operational lists. Consumers declare which
 * header actions are enabled; individual row action columns are not needed. */
export function ListCommandToolbar({
  mode,
  count = 0,
  enableCreate = false,
  enableEdit = false,
  enableDelete = false,
  showSelectionSummary = true,
  onCreate,
  onEdit,
  onDelete,
  children,
}: {
  mode: ListSelectionMode;
  count?: number;
  enableCreate?: boolean;
  enableEdit?: boolean;
  enableDelete?: boolean;
  showSelectionSummary?: boolean;
  onCreate?: ListHeaderAction;
  onEdit?: ListHeaderAction;
  onDelete?: ListHeaderAction;
  children?: React.ReactNode;
}) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [hasSearch, setHasSearch] = useState(false);

  useEffect(() => {
    const surface = toolbarRef.current?.closest("[data-list-surface]");
    setHasSearch(Boolean(surface?.querySelector("[data-list-search-trigger]")));
  }, []);

  function openSearch() {
    const surface = toolbarRef.current?.closest("[data-list-surface]");
    (surface?.querySelector("[data-list-search-trigger]") as HTMLButtonElement | null)?.click();
  }

  return (
    <div ref={toolbarRef} className="flex min-h-16 items-center gap-3 border-b border-stone-100 bg-stone-50/70 px-4 py-3 dark:border-stone-800 dark:bg-stone-900/60">
      {enableCreate && onCreate && (
        <button
          type="button"
          onClick={onCreate.onClick}
          disabled={onCreate.disabled || onCreate.busy}
          aria-label={onCreate.busy ? "Creating record" : onCreate.label ?? "New record"}
          title={onCreate.label ?? "New record"}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-700 text-lg font-semibold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-green-600 dark:hover:bg-green-500"
        >
          {onCreate.busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <span aria-hidden="true">+</span>}
        </button>
      )}
      {showSelectionSummary ? <ListSelectionSummary count={count} /> : null}
      <div className="ml-auto flex flex-wrap justify-end gap-2">
        {hasSearch && <button type="button" onClick={openSearch} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700 transition hover:bg-green-50 hover:text-green-800 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-green-950 dark:hover:text-green-300"><SearchGlyph />Search</button>}
        {enableEdit && onEdit && <ListHeaderButton kind="edit" action={onEdit} />}
        {enableDelete && onDelete && <ListHeaderButton kind="delete" action={onDelete} />}
        {children}
      </div>
    </div>
  );
}

function SearchGlyph() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><circle cx="8.5" cy="8.5" r="4.75" /><path strokeLinecap="round" d="m12 12 4.25 4.25" /></svg>;
}

function ListHeaderButton({ kind, action }: { kind: "edit" | "delete"; action: ListHeaderAction }) {
  if (kind === "delete") {
    const label = action.label ?? "Delete";
    return (
      <button
        type="button"
        onClick={action.onClick}
        disabled={action.disabled || action.busy}
        title={label}
        aria-label={label}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-red-600 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400 dark:hover:bg-stone-800"
      >
        {action.busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <DeleteGlyph />}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled || action.busy}
      className="inline-flex min-h-10 items-center gap-2 rounded-full border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700 transition hover:bg-green-50 hover:text-green-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-green-950 dark:hover:text-green-300"
    >
      {action.busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <EditGlyph />}
      {action.busy ? "Working…" : action.label ?? "Edit"}
    </button>
  );
}

/** Collapsible creation area owned by a list. It keeps create forms with the
 * records they affect instead of requiring a persistent adjacent form panel. */
export function ListCreatePanel({
  open,
  title = "Add record",
  children,
  className = "",
}: {
  open: boolean;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  if (!open) return null;
  return <section className={`border-b border-stone-100 bg-green-50/50 px-4 py-4 dark:border-stone-800 dark:bg-green-950/10 ${className}`} aria-label={title}>
    <h3 className="mb-3 text-sm font-semibold text-stone-800 dark:text-stone-100">{title}</h3>
    {children}
  </section>;
}

function EditGlyph() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" /><path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" /></svg>;
}

function DeleteGlyph() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c-.84 0-1.673.025-2.5.075V3.75c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25v.325C11.673 4.025 10.84 4 10 4ZM8.58 7.72a.75.75 0 0 1 .7.647l.467 3.265a.75.75 0 0 1-1.494.106l-.466-3.265a.75.75 0 0 1 .792-.853Zm3.336.002a.75.75 0 0 1 .763.916l-.465 3.25a.75.75 0 0 1-1.478-.253l.464-3.25a.75.75 0 0 1 .716-.663ZM9.373 7.08a.75.75 0 0 1 .734.765l-.209 3.132a.75.75 0 0 1-1.498-.04l.21-3.131a.75.75 0 0 1 .763-.726Zm1.503 0a.75.75 0 0 1 .763.726l.209 3.132a.75.75 0 1 1-1.498.04l-.209-3.131a.75.75 0 0 1 .735-.767Z" clipRule="evenodd" /></svg>;
}

export function ListSurface({ children, className = "", refreshing = false, ...frame }: Omit<FrameworkListProps, "children" | "className"> & { children: React.ReactNode; className?: string; refreshing?: boolean }) {
  return <FrameworkList {...frame} className={`rounded-[1.25rem] shadow-sm ${className}`}><div data-list-surface aria-busy={refreshing}>{refreshing && <p className="border-b border-green-100 bg-green-50/70 px-4 py-2 text-xs font-medium text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300" role="status">Refreshing this list…</p>}{children}</div></FrameworkList>;
}

export function ListSidePanel({
  children,
  className = "",
  refreshing = false,
  ...frame
}: Omit<FrameworkListProps, "children" | "className"> & { children: React.ReactNode; className?: string; refreshing?: boolean }) {
  return (
    <aside data-list-side-panel className={`flex overflow-hidden rounded-[1.5rem] border border-stone-200 bg-white shadow-lg shadow-stone-950/5 dark:border-stone-700 dark:bg-stone-900 dark:shadow-black/20 ${className}`}>
      <FrameworkList {...frame} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-none border-0 bg-inherit shadow-none">
        <div data-list-surface aria-busy={refreshing} className="flex min-h-0 min-w-0 flex-1 flex-col">
          {refreshing && <p className="border-b border-green-100 bg-green-50/70 px-4 py-2 text-xs font-medium text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300" role="status">Refreshing this list…</p>}
          {children}
        </div>
      </FrameworkList>
    </aside>
  );
}

type SortState = { key: string; dir: "asc" | "desc" } | null;
type StoredListControls = {
  filters: Record<string, string>;
  columnSearches: Record<string, string>;
  appliedColumnSearches: Record<string, string>;
  advancedQuery: string;
  appliedAdvancedQuery: string;
  sort: SortState;
};
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

export function useListControls<T>(
  rows: T[],
  columns: ColumnDef<T>[],
  options: {
    initialFilters?: Record<string, string>;
    storageKey?: string;
    /** From useFrameworkListData/useLocalEntityListData — enables persisted + role-locked search generically, with zero per-list wiring. */
    searchState?: FrameworkListSearchState;
    onApplySearch?: (criteria: Record<string, string>, advancedQuery: string) => void;
  } = {},
) {
  const [sort, setSort] = useState<SortState>(null);
  const [filters, setFilters] = useState<Record<string, string>>(options.initialFilters ?? {});
  const [columnSearches, setColumnSearches] = useState<Record<string, string>>({});
  const [appliedColumnSearches, setAppliedColumnSearches] = useState<Record<string, string>>({});
  const [advancedQuery, setAdvancedQuery] = useState("");
  const [appliedAdvancedQuery, setAppliedAdvancedQuery] = useState("");
  const [storageHydrated, setStorageHydrated] = useState(!options.storageKey);
  const [locked, setLocked] = useState<Record<string, string>>({});
  const [lockedAdvancedQuery, setLockedAdvancedQuery] = useState<string | null>(null);
  const seededSearchState = useRef(false);

  useEffect(() => {
    if (!options.searchState) return;
    const { saved, savedAdvancedQuery, locked: nextLocked, lockedAdvancedQuery: nextLockedAdvancedQuery } = options.searchState;
    setLocked(nextLocked);
    // Kept separate from the editable advancedQuery state below — this is
    // display-only. The lock is enforced server-side (loadListResource ANDs
    // it in unconditionally); the client never needs to splice it into what
    // it sends.
    setLockedAdvancedQuery(nextLockedAdvancedQuery ?? null);
    if (!seededSearchState.current) {
      seededSearchState.current = true;
      const merged = { ...(saved ?? {}), ...nextLocked };
      if (Object.keys(merged).length > 0) {
        setColumnSearches(merged);
        setAppliedColumnSearches(merged);
      }
      if (savedAdvancedQuery) {
        setAdvancedQuery(savedAdvancedQuery);
        setAppliedAdvancedQuery(savedAdvancedQuery);
      }
    } else if (Object.keys(nextLocked).length > 0) {
      // A lock can be added/changed by an owner/manager without this list
      // remounting — keep forcing it so it can't linger cleared client-side.
      setColumnSearches((prev) => ({ ...prev, ...nextLocked }));
      setAppliedColumnSearches((prev) => ({ ...prev, ...nextLocked }));
    }
  }, [options.searchState]);

  useEffect(() => {
    if (!options.storageKey) return;
    const stored = window.sessionStorage.getItem(options.storageKey);
    if (stored !== null) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          // Support the status-only shape stored by the earlier implementation.
          if ("filters" in parsed) {
            const saved = parsed as Partial<StoredListControls>;
            if (saved.filters) setFilters(saved.filters);
            if (saved.columnSearches) setColumnSearches(saved.columnSearches);
            if (saved.appliedColumnSearches) setAppliedColumnSearches(saved.appliedColumnSearches);
            if (typeof saved.advancedQuery === "string") setAdvancedQuery(saved.advancedQuery);
            if (typeof saved.appliedAdvancedQuery === "string") setAppliedAdvancedQuery(saved.appliedAdvancedQuery);
            if (saved.sort === null || (saved.sort && typeof saved.sort.key === "string" && (saved.sort.dir === "asc" || saved.sort.dir === "desc"))) setSort(saved.sort);
          } else {
            setFilters(parsed as Record<string, string>);
          }
        }
      } catch {
        window.sessionStorage.removeItem(options.storageKey);
      }
    }
    setStorageHydrated(true);
  }, [options.storageKey]);

  useEffect(() => {
    if (!options.storageKey || !storageHydrated) return;
    const saved: StoredListControls = { filters, columnSearches, appliedColumnSearches, advancedQuery, appliedAdvancedQuery, sort };
    window.sessionStorage.setItem(options.storageKey, JSON.stringify(saved));
  }, [advancedQuery, appliedAdvancedQuery, appliedColumnSearches, columnSearches, filters, options.storageKey, sort, storageHydrated]);

  function toggleSort(key: string) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  function setFilter(key: string, value: string) {
    if (Object.hasOwn(locked, key)) return;
    setFilters((prev) => {
      return { ...prev, [key]: value };
    });
  }

  function setColumnSearch(key: string, value: string) {
    if (Object.hasOwn(locked, key)) return; // locked by an owner/manager for this role — not user-editable
    setColumnSearches((prev) => ({ ...prev, [key]: value }));
  }

  function clearFilters() {
    setFilters({});
    setColumnSearches({ ...locked });
    setAppliedColumnSearches({ ...locked });
    setAdvancedQuery("");
    setAppliedAdvancedQuery("");
    options.onApplySearch?.({ ...locked }, "");
  }

  function applySearch() {
    const merged = { ...columnSearches, ...locked };
    setAppliedColumnSearches(merged);
    setAppliedAdvancedQuery(advancedQuery);
    options.onApplySearch?.(merged, advancedQuery);
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
          // A column combines an LOV datalist with direct typing, so both
          // selection and partial manual entry use the same contains match.
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
    locked,
    lockedAdvancedQuery,
    canManageLocks: options.searchState?.canManageLocks ?? false,
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
  const locked = Object.hasOwn(controls.locked, col.key);
  const value = locked ? controls.locked[col.key]! : controls.filters[col.key] ?? "";
  if (col.filter === "select") {
    return (
      <select
        value={value}
        disabled={locked}
        title={locked ? "Locked by your role" : undefined}
        onChange={(e) => controls.setFilter(col.key, e.target.value)}
        className="w-full rounded border border-stone-200 bg-white px-1.5 py-1 text-xs disabled:opacity-60 dark:border-stone-700 dark:bg-stone-800"
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
      disabled={locked}
      title={locked ? "Locked by your role" : undefined}
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
  id,
  listScope,
}: {
  columns: ColumnDef<T>[];
  controls: ListControls<T>;
  label?: string;
  /** Stable id used when a list's search trigger lives in a surrounding workspace header. */
  id?: string;
  variant?: "inline" | "popover";
  /** This list instance's persistence/lock key. Owner/manager only: shows the inline "lock this search for a role" control when set. */
  listScope?: string;
}) {
  const generatedSearchPanelId = `list-search-${useId().replace(/:/g, "")}`;
  const searchPanelId = id ?? generatedSearchPanelId;
  const searchCols = columns.filter((col) => col.accessor);
  if (searchCols.length === 0) return null;

  return (
    <>
        <button type="button" data-list-search-trigger popoverTarget={searchPanelId} popoverTargetAction="toggle" tabIndex={-1} aria-hidden="true" className="sr-only">{label}</button>
        <div id={searchPanelId} popover="auto" className="fixed left-1/2 top-16 z-[90] m-0 max-h-[calc(100dvh-5rem)] w-[min(58rem,calc(100vw-2rem))] -translate-x-1/2 overflow-y-auto rounded-[1.75rem] border border-stone-200 bg-white p-5 shadow-2xl backdrop:bg-stone-950/25 dark:border-stone-700 dark:bg-stone-950">
            <div className="mb-4">
              <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">{label} criteria</h3>
              <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Type a value or choose an LOV suggestion, then select Search to apply it.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={`${label} by column`}>
              {searchCols.map((col) => (
                <label key={col.key} className="grid gap-1.5 text-xs font-semibold text-stone-500 dark:text-stone-400">
                  {col.label}
                  <ColumnSearchInput col={col} controls={controls} />
                </label>
              ))}
              <details className="group sm:col-span-2 lg:col-span-3" open={Boolean(controls.lockedAdvancedQuery) || undefined}>
                <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1 rounded-full border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-800 [&::-webkit-details-marker]:hidden">
                  Advanced <span aria-hidden="true">⌄</span>
                </summary>
                <div className="mt-3 rounded-2xl bg-stone-50 p-4 dark:bg-stone-900">
                  {controls.lockedAdvancedQuery && (
                    <p className="mb-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                      Always applied by your role: <span className="font-mono">{controls.lockedAdvancedQuery}</span>
                    </p>
                  )}
                  <label className="grid gap-2 text-xs font-semibold text-stone-500 dark:text-stone-400">
                    {controls.lockedAdvancedQuery ? "Add your own terms (combined with the query above)" : "Advanced query"}
                    <input value={controls.advancedQuery} onChange={(event) => controls.setAdvancedQuery(event.target.value)} placeholder='broker:BPML netKg>100 saleNo:019 "Galle"' className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-normal text-stone-800 outline-none focus:border-green-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100" />
                  </label>
                </div>
              </details>
              {listScope && controls.canManageLocks && (
                <details className="group sm:col-span-2 lg:col-span-3">
                  <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1 rounded-full border border-amber-300 px-4 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/40 [&::-webkit-details-marker]:hidden">
                    Lock this search for a role <span aria-hidden="true">⌄</span>
                  </summary>
                  <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/20">
                    <LockSearchControl listScope={listScope} controls={controls} />
                  </div>
                </details>
              )}
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
    </>
  );
}

// Owner/manager only, rendered inline in this same search panel — locking a
// search is configured at the list it applies to, not a separate admin
// screen. Invisible to every other role (gated by controls.canManageLocks).
//
// A selection is either a base role ("base:supervisor") or a specific
// factory-defined custom role ("custom:<access_role_id>") — the lock itself
// (list_search_locks) and its server-side enforcement already support both;
// this control just needs to offer the custom-role list too.
function LockSearchControl<T>({ listScope, controls }: { listScope: string; controls: ListControls<T> }) {
  const [selection, setSelection] = useState<string>(`base:${LOCKABLE_ROLES[0]}`);
  const [customRoles, setCustomRoles] = useState<{ id: string; name: string; baseRole: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listLockableRoles().then((result) => {
      if (!cancelled && result.ok) setCustomRoles(result.roles);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function target(): { role: { baseRole: Role } | { accessRoleId: string }; label: string } {
    if (selection.startsWith("custom:")) {
      const id = selection.slice("custom:".length);
      const found = customRoles.find((r) => r.id === id);
      return { role: { accessRoleId: id }, label: found?.name ?? "this role" };
    }
    const baseRole = selection.slice("base:".length) as Role;
    return { role: { baseRole }, label: baseRole };
  }

  async function lock() {
    setBusy(true);
    try {
      const { role, label } = target();
      const criteria = { ...controls.columnSearches, ...controls.locked };
      const result = await saveListSearchLock({ listScope, role, criteria, advancedQuery: controls.advancedQuery });
      showAppToast(result.ok ? `Search locked for ${label}.` : result.error, result.ok ? undefined : "error");
    } finally {
      setBusy(false);
    }
  }

  async function unlock() {
    setBusy(true);
    try {
      const { role, label } = target();
      const result = await removeListSearchLock({ listScope, role });
      showAppToast(result.ok ? `Lock removed for ${label}.` : result.error, result.ok ? undefined : "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-semibold text-amber-800 dark:text-amber-300">Lock this search for role:</span>
      <select
        value={selection}
        onChange={(event) => setSelection(event.target.value)}
        className="rounded border border-amber-300 bg-white px-2 py-1 dark:border-amber-800 dark:bg-stone-900"
      >
        <optgroup label="Base role">
          {LOCKABLE_ROLES.map((r) => <option key={r} value={`base:${r}`}>{r}</option>)}
        </optgroup>
        {customRoles.length > 0 && (
          <optgroup label="Custom role">
            {customRoles.map((r) => <option key={r.id} value={`custom:${r.id}`}>{r.name} ({r.baseRole})</option>)}
          </optgroup>
        )}
      </select>
      <button type="button" disabled={busy} onClick={lock} className="min-h-8 rounded-full bg-amber-700 px-3 font-semibold text-white disabled:opacity-50 dark:bg-amber-600">
        Lock current search
      </button>
      <button type="button" disabled={busy} onClick={unlock} className="min-h-8 rounded-full border border-amber-300 px-3 font-semibold text-amber-800 disabled:opacity-50 dark:border-amber-800 dark:text-amber-300">
        Remove lock
      </button>
      <span className="basis-full text-[0.7rem] font-normal text-amber-700/80 dark:text-amber-400/80">
        Owner and manager see unrestricted data, unless a custom role narrows them. Every other role on this list will have these fields fixed and disabled.
      </span>
    </div>
  );
}

function ColumnSearchInput<T>({ col, controls }: { col: ColumnDef<T>; controls: ListControls<T> }) {
  const locked = Object.hasOwn(controls.locked, col.key);
  const value = locked ? controls.locked[col.key]! : controls.columnSearches[col.key] ?? "";
  const lovId = useId().replace(/:/g, "");
  const inputType = col.searchInput ?? "text";
  // Dates are intentionally picker-only: a date's native picker is the LOV.
  if (inputType === "date") {
    return (
      <input
        type="date"
        value={value}
        disabled={locked}
        title={locked ? "Locked by your role — not editable" : undefined}
        onChange={(event) => controls.setColumnSearch(col.key, event.target.value)}
        className="min-h-10 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-normal text-stone-800 disabled:opacity-60 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
      />
    );
  }
  const searchFieldClass = "min-h-10 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-normal text-stone-800 disabled:opacity-60 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100";
  // A server-backed LOV searches the whole reference table, so it still offers
  // every value once the list itself is paginated.
  if (col.lovSource && !locked) {
    return (
      <LovCombobox
        source={col.lovSource}
        defaultValue={value}
        defaultLabel={value}
        placeholder={`Search ${col.label.toLowerCase()}`}
        ariaLabel={col.label}
        className={searchFieldClass}
        onSelect={(option) => controls.setColumnSearch(col.key, option?.label ?? "")}
      />
    );
  }
  // A fixed-choice column (a status, a state, a yes/no) is a LOV too: its
  // whole option set is known up front, so it is presented as a picker rather
  // than a text box with suggestions. Declaring `filterOptions` on the column
  // is what makes every possible value offered — without it the set can only
  // be derived from the rows already loaded, which silently hides any state
  // that happens not to be on screen.
  if (col.filter === "select" && !locked) {
    const options = controls.optionsFor(col);
    return (
      <LovCombobox
        options={options}
        defaultValue={value}
        defaultLabel={value}
        placeholder={`Search ${col.label.toLowerCase()}`}
        ariaLabel={col.label}
        className={searchFieldClass}
        onSelect={(option) => controls.setColumnSearch(col.key, option?.label ?? "")}
      />
    );
  }
  const listId = `list-lov-${lovId}`;
  return (
    <>
      <input
      list={locked ? undefined : listId}
      type={inputType}
      value={value}
      disabled={locked}
      title={locked ? "Locked by your role — not editable" : undefined}
      onChange={(event) => controls.setColumnSearch(col.key, event.target.value)}
      placeholder={`Search ${col.label.toLowerCase()}`}
      className="min-h-10 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-normal text-stone-800 disabled:opacity-60 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
      />
      {!locked && (
        <datalist id={listId} data-list-lov>
        {controls.optionsFor(col).map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
        </datalist>
      )}
    </>
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
