"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { showAppToast } from "@/components/action-feedback";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { LovCombobox } from "@/components/lov-combobox";
import { DEFAULT_COLUMN_MIN_WIDTH, ListViewModeMenu, useListViewMode } from "@/components/list-view-mode";
import {
  ListCommandToolbar,
  ListCreatePanel,
  ListSearchPanel,
  ListSelectionCell,
  ListSelectionHeader,
  ListSidePanel,
  ListSurface,
  SortButton,
  TabbedListSurface,
  useFrameworkListData,
  useListControls,
  useListSelection,
  type ColumnDef,
  type FrameworkListSearchState,
  type ListDefinition,
} from "@/components/list-controls";
import { refreshListResource } from "@/lib/list-resource-action";
import { saveListSearchState } from "@/lib/list-search-actions";
import { ENTITY_LIST_METADATA } from "@/lib/entity-list-metadata";
import type { ListMutationResult } from "@/lib/list-mutations";
import type { ListResourceKey, ListResourceRequest, ListResourceRow } from "@/lib/list-resources";

/**
 * Submit handler for the framework's own inline create/edit `<form>` tags
 * (their fields live outside the element, associated via `form={id}`). Using
 * a plain `onSubmit` instead of the `action` prop avoids React's built-in
 * behavior of resetting the form's fields as soon as submission starts —
 * which fires regardless of whether the mutation ends up succeeding or
 * failing, and would otherwise blank out every uncontrolled field (anything
 * using `defaultValue`) the instant an inline create/edit is submitted, error
 * or not.
 */
function handleInlineFormSubmit(action: (formData: FormData) => Promise<void>) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void action(new FormData(event.currentTarget));
  };
}

export type EntityListMutationOptions = {
  notice?: string;
  onSuccess?: () => void;
};

export type EntityListDataContext<Row> = {
  rows: Row[];
  refreshing: boolean;
  mutate: (action: () => Promise<ListMutationResult>, options?: EntityListMutationOptions) => Promise<boolean>;
  mutationAction: (
    action: (formData: FormData) => Promise<ListMutationResult>,
    options?: EntityListMutationOptions,
  ) => (formData: FormData) => Promise<void>;
  /** Restored/locked search state for this list instance — undefined until the (one, generic) restore fetch resolves. */
  searchState?: FrameworkListSearchState;
  hasMore?: boolean;
  loadingMore?: boolean;
  loadMore?: () => Promise<void>;
  applySearch?: (criteria: Record<string, string>, advancedQuery: string) => void;
};

export type EntityListContext<Row> = EntityListDataContext<Row> & {
  visibleRows: Row[];
  controls: ReturnType<typeof useListControls<Row>>;
  selection: ReturnType<typeof useListSelection<Row>>;
};

export type EntityListCellContext = {
  editing: boolean;
  formId: string | null;
  refreshing: boolean;
};

export type EntityListColumn<Row> = ColumnDef<Row> & {
  headerClassName?: string;
  cellClassName?: string;
  render?: (row: Row, context: EntityListCellContext) => ReactNode;
  edit?: (row: Row, context: { formId: string }) => ReactNode;
};

const LOV_EDIT_INPUT_CLASS = "w-full rounded border border-stone-300 bg-white px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-900";
/** Fixed width of the leading checkbox column, matching ListSelectionCell. */
const SELECTION_COLUMN_WIDTH = 48;
/**
 * Floor for a dragged column. Deliberately NOT `ColumnDef.minWidth`: that
 * expresses "narrowest width this column is still READABLE at", which decides
 * what fits in list mode. A user dragging a column narrower has decided they
 * do not need to read it, and must not be blocked by that hint.
 */
const MIN_RESIZE_WIDTH = 56;

/**
 * Full text for a truncated cell's tooltip. Uses the column's accessor — the
 * sortable/searchable value — because `render` may return arbitrary markup
 * that has no single string form.
 */
function cellTitle<Row>(column: EntityListColumn<Row>, row: Row): string | undefined {
  const value = column.accessor?.(row);
  if (value == null) return undefined;
  const text = String(value).trim();
  return text === "" ? undefined : text;
}

/**
 * Drag target that widens or narrows one column in table mode.
 *
 * Tracks the pointer on the window rather than on itself so the drag survives
 * the cursor leaving the 9px handle, which at speed it always does.
 */
function ColumnResizeHandle({
  label,
  width,
  minWidth,
  onResize,
}: {
  label: string;
  width: number;
  minWidth: number;
  onResize: (width: number) => void;
}) {
  const [resizing, setResizing] = useState(false);

  function start(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = width;
    setResizing(true);
    document.body.dataset.listResizing = "true";

    const move = (moveEvent: PointerEvent) => {
      onResize(Math.max(minWidth, startWidth + (moveEvent.clientX - startX)));
    };
    const end = () => {
      setResizing(false);
      delete document.body.dataset.listResizing;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  return (
    <button
      type="button"
      aria-label={`Resize ${label} column`}
      data-resizing={resizing ? "true" : undefined}
      onPointerDown={start}
      // Sorting lives on the header label; a click on the grip must not sort.
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        onResize(Math.max(minWidth, width + (event.key === "ArrowRight" ? 16 : -16)));
      }}
      className="list-col-resize"
    />
  );
}

/**
 * The inline editor for one cell.
 *
 * A column that declares `lovSource` AND `lovEdit` gets the shared LOV
 * combobox for free — no per-list `edit` renderer, which is what lets every
 * list inherit the picker (typeahead, server-side search, descriptions,
 * DB-enforced values) instead of hand-rolling a `<select>` or a free-text
 * input. An explicit `edit` still wins, for bespoke controls.
 *
 * `lovEdit` is required because `lovSource` is also (and often only) a SEARCH
 * declaration. Rendering an editor for a column the list's save action does
 * not read produces a field name nobody consumes: the value is dropped and
 * the cell snaps back, looking like the edit was rejected.
 */
function editCellContent<Row>(
  column: EntityListColumn<Row>,
  row: Row,
  formId: string,
): ReactNode {
  if (column.edit) return column.edit(row, { formId });
  // `lovEdit` is the opt-in; `lovSource` alone only feeds the search field.
  if (!column.lovSource || !column.lovEdit) return null;
  const label = column.accessor?.(row);
  const stored = column.lovValue ? column.lovValue(row) : label;
  return (
    <LovCombobox
      source={column.lovSource}
      name={column.lovName ?? column.key}
      formId={formId}
      defaultValue={stored == null ? "" : String(stored)}
      defaultLabel={label == null ? "" : String(label)}
      ariaLabel={column.label}
      className={LOV_EDIT_INPUT_CLASS}
    />
  );
}

export type EntityListCreate<Row> = {
  action: (formData: FormData) => Promise<ListMutationResult>;
  panelTitle?: string;
  /** Optional layout treatment for a large create form inside a constrained list panel. */
  panelClassName?: string;
  label?: string;
  disabledReason?: string;
  onSuccess?: () => void;
  /** Opens a create workflow rendered by the surrounding detail workspace. */
  onOpen?: () => void;
  render?: (context: {
    action: (formData: FormData) => Promise<void>;
    close: () => void;
    rows: Row[];
  }) => ReactNode;
  /** Renders table cells for a draft row whose controls belong to formId. */
  renderRow?: (context: {
    formId: string;
    rows: Row[];
  }) => ReactNode;
};

export type EntityListEdit<Row> = {
  action: (row: Row, formData: FormData) => Promise<ListMutationResult>;
  canEdit?: boolean;
  disabledReason?: string;
  label?: string;
  saveLabel?: string;
  formId?: (row: Row) => string;
  onSuccess?: (row: Row) => void;
  /** Use for editors that replace the complete row instead of individual cells. */
  renderPanel?: (context: {
    row: Row;
    action: (formData: FormData) => Promise<void>;
    close: () => void;
  }) => ReactNode;
};

export type EntityListDelete<Row> = {
  action: (ids: string[], rows: Row[]) => Promise<ListMutationResult>;
  disabled?: (rows: Row[]) => boolean;
  disabledReason?: (rows: Row[]) => string | undefined;
  title?: (count: number) => string;
  description?: (rows: Row[]) => string;
  confirmLabel?: string;
};

export type EntityListCommandContext<Row> = EntityListDataContext<Row> & {
  selectedRows: Row[];
  selectedIds: Set<string>;
  clearSelection: () => void;
};

export type EntityListCommand<Row> = {
  id: string;
  label: string | ((context: EntityListCommandContext<Row>) => string);
  pendingLabel?: string;
  visible?: boolean;
  destructive?: boolean;
  disabled?: (context: EntityListCommandContext<Row>) => boolean;
  disabledReason?: (context: EntityListCommandContext<Row>) => string | undefined;
  run?: (context: EntityListCommandContext<Row>) => Promise<ListMutationResult>;
  confirm?: {
    title: string | ((context: EntityListCommandContext<Row>) => string);
    description: string | ((context: EntityListCommandContext<Row>) => string);
    confirmLabel?: string;
  };
  panel?: {
    title: string | ((context: EntityListCommandContext<Row>) => string);
    action: (formData: FormData, context: EntityListCommandContext<Row>) => Promise<ListMutationResult>;
    render: (context: {
      action: (formData: FormData) => Promise<void>;
      close: () => void;
      command: EntityListCommandContext<Row>;
    }) => ReactNode;
  };
};

export type EntityListTab = {
  id: string;
  label: string;
  count?: string;
  content: ReactNode;
};

export type EntityListViewTab<Row> = {
  id: string;
  label: string;
  filter: (row: Row) => boolean;
  limit?: number;
  count?: (rows: Row[]) => string;
  definition?: EntityListCommonProps<Row>["definition"];
  title?: string;
  description?: string;
  commands?: EntityListCommand<Row>[];
  emptyMessage?: string;
  filteredEmptyMessage?: string;
  className?: string;
  headerClassName?: string;
  rowClassName?: EntityListCommonProps<Row>["rowClassName"];
};

export type EntityListViewTabs<Row> = {
  label?: string;
  defaultTab?: string;
  items: EntityListViewTab<Row>[];
};

export type EntityListSideList<Row> = {
  href: (row: Row) => string;
  content: (row: Row, context: { active: boolean; selected: boolean }) => ReactNode;
  isActive?: (row: Row) => boolean;
  onSelect?: (row: Row) => void;
  sortColumnKey?: string;
  searchLabel?: string;
  bodyClassName?: string;
  showSelectionSummary?: boolean;
};

export function EntityListTabs({
  tabs,
  defaultTab,
  label = "Related lists",
}: {
  tabs: EntityListTab[];
  defaultTab?: string;
  label?: string;
}) {
  return (
    <section aria-label={label}>
      <TabbedListSurface
        tabs={tabs.map(({ id, label: tabLabel, count }) => ({ id, label: tabLabel, count }))}
        defaultTab={defaultTab}
      >
        {tabs.map((tab) => <div key={tab.id}>{tab.content}</div>)}
      </TabbedListSurface>
    </section>
  );
}

type EntityListRenderMode = "workflow" | "matrix";

type EntityListCommonProps<Row> = {
  initialRows: Row[];
  definition: Omit<ListDefinition<Row>, "columns"> & {
    columns: EntityListColumn<Row>[];
  };
  getId: (row: Row) => string;
  rowLabel: (row: Row) => string;
  canCreate?: boolean;
  create?: EntityListCreate<Row>;
  /** Header is the default. Toolbar keeps New beside Search for dense tables. */
  createPlacement?: "header" | "toolbar";
  edit?: EntityListEdit<Row>;
  canDelete?: boolean;
  deleteAction?: EntityListDelete<Row>;
  commands?: EntityListCommand<Row>[];
  title?: string;
  description?: string | ((rows: Row[]) => string);
  actions?: ReactNode | ((rows: Row[]) => ReactNode);
  summary?: (rows: Row[]) => ReactNode;
  /** @deprecated Use summary. */
  beforeTable?: (rows: Row[]) => ReactNode;
  footer?: (context: {
    rows: Row[];
    visibleRows: Row[];
    selectionColumn: boolean;
  }) => ReactNode;
  emptyMessage: string;
  filteredEmptyMessage?: string;
  className?: string;
  headerClassName?: string;
  rowClassName?: (row: Row, context: EntityListCellContext & { selected: boolean }) => string;
  onRowsChange?: (rows: Row[]) => void;
  /** Partition one entity resource into independently controlled list tabs. */
  tabs?: EntityListViewTabs<Row>;
  /** Declarative linked-card presentation for ordinary record side panels. */
  sideList?: EntityListSideList<Row>;
  /** Hides list-local title and toolbar chrome when controls are hosted by a surrounding workspace header. */
  chrome?: "default" | "records-only";
  /** Stable search popover id for a framework search trigger rendered outside the list panel. */
  searchPanelId?: string;
  /** Initial and route-persistent controls for a specific operational list. */
  listControls?: { initialFilters?: Record<string, string>; storageKey?: string };
} & (
  | {
      render?: undefined;
      renderMode?: never;
    }
  | {
      /**
       * Reserved for genuine multi-stage workflows, matrices, and detail layouts.
       * Ordinary CRUD lists must use the declarative create/edit/commands/table API.
       */
      render: (context: EntityListContext<Row>) => ReactNode;
      renderMode: EntityListRenderMode;
    }
);

type LiveEntityListProps<Key extends ListResourceKey> = EntityListCommonProps<ListResourceRow<Key>> & {
  resource: ListResourceRequest<Key>;
};

type LocalEntityListProps<Row> = EntityListCommonProps<Row> & {
  resource?: never;
  /** Stable UI identity used for selection controls in read-only/local lists. */
  scope: string;
};

export function EntityList<Key extends ListResourceKey>(props: LiveEntityListProps<Key>): ReactNode;
export function EntityList<Row>(props: LocalEntityListProps<Row>): ReactNode;
export function EntityList(props: object) {
  if ("resource" in props) {
    return <LiveEntityList {...props as LiveEntityListProps<ListResourceKey>} />;
  }
  return <LocalEntityList {...props as LocalEntityListProps<unknown>} />;
}

function LiveEntityList<Key extends ListResourceKey>(props: LiveEntityListProps<Key>) {
  const data = useFrameworkListData({
    initialRows: props.initialRows,
    resource: props.resource,
  });
  const meta = ENTITY_LIST_METADATA[props.resource.key];

  return (
    <EntityListPanel
      {...props}
      {...data}
      scope={props.resource.key}
      title={props.title ?? meta.title}
      description={props.description ?? meta.description}
    />
  );
}

function LocalEntityList<Row>(props: LocalEntityListProps<Row>) {
  const data = useLocalEntityListData(props.initialRows, props.scope);
  return <EntityListPanel {...props} {...data} />;
}

/** Headless subscription for live option data used by an EntityList create/edit form. */
export function EntityListResource<Key extends ListResourceKey>({
  resource,
  initialRows,
  children,
}: {
  resource: ListResourceRequest<Key>;
  initialRows: ListResourceRow<Key>[];
  children: (context: EntityListDataContext<ListResourceRow<Key>>) => ReactNode;
}) {
  const data = useFrameworkListData({ initialRows, resource });
  return <>{children(data)}</>;
}

function useLocalEntityListData<Row>(initialRows: Row[], scope: string): EntityListDataContext<Row> {
  const [rows, setRows] = useState(initialRows);
  useEffect(() => setRows(initialRows), [initialRows]);

  // Local lists (detail-page side panels) get their rows as server-rendered
  // props, not through the resource registry — this one small fetch is the
  // only generic hook point available to restore their saved+locked search.
  const [searchState, setSearchState] = useState<EntityListDataContext<Row>["searchState"]>(undefined);
  useEffect(() => {
    let cancelled = false;
    void refreshListResource({ key: "framework.search-state", params: { listScope: scope } }).then((result) => {
      if (cancelled || !result.ok) return;
      const state = result.rows[0];
      if (state) setSearchState(state);
    });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  function applySearch(criteria: Record<string, string>, advancedQuery: string) {
    void saveListSearchState({ listScope: scope, criteria, advancedQuery: advancedQuery || null });
  }

  async function mutate(
    action: () => Promise<ListMutationResult>,
    options: EntityListMutationOptions = {},
  ) {
    try {
      const result = await action();
      if (!result.ok) {
        showAppToast(result.error, "error");
        return false;
      }
      options.onSuccess?.();
      showAppToast(result.notice ?? options.notice ?? "List updated.");
      return true;
    } catch {
      showAppToast("The change could not be saved. Please try again.", "error");
      return false;
    }
  }
  const mutationAction = (
    action: (formData: FormData) => Promise<ListMutationResult>,
    options: EntityListMutationOptions = {},
  ) => async (formData: FormData) => {
    await mutate(() => action(formData), options);
  };

  return { rows, refreshing: false, mutate, mutationAction, searchState, applySearch };
}

type EntityListPanelProps<Row> = EntityListCommonProps<Row>
  & EntityListDataContext<Row>
  & { scope: string };

function EntityListPanel<Row>({
  scope,
  definition,
  getId,
  rowLabel,
  canCreate = true,
  create,
  createPlacement = "toolbar",
  edit,
  canDelete = true,
  deleteAction,
  commands = [],
  title,
  description,
  actions,
  summary,
  beforeTable,
  footer,
  emptyMessage,
  filteredEmptyMessage = "No records match these filters.",
  className,
  headerClassName,
  rowClassName,
  onRowsChange,
  tabs,
  sideList,
  chrome = "default",
  searchPanelId,
  listControls,
  render,
  rows,
  refreshing,
  mutate,
  mutationAction,
  searchState,
  hasMore,
  loadingMore,
  loadMore,
  applySearch,
}: EntityListPanelProps<Row>) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busyCommand, setBusyCommand] = useState<string | null>(null);
  const [confirmingCommand, setConfirmingCommand] = useState<string | null>(null);
  const [panelCommand, setPanelCommand] = useState<string | null>(null);
  const { mode: viewMode, setMode: setViewMode, widths: columnWidths, setColumnWidth } = useListViewMode(scope);
  const tableViewportRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const tableId = `entity-list-${useId().replace(/:/g, "")}`;
  const controls = useListControls(rows, definition.columns, { ...listControls, searchState, onApplySearch: applySearch });
  const visibleRows = controls.rows;
  const selectionMode = definition.selectionMode ?? "single";
  const selection = useListSelection(rows, { mode: selectionMode, getId });
  const selectedRows = rows.filter((row) => selection.selectedIds.has(getId(row)));
  const editingRow = rows.find((row) => getId(row) === editingId) ?? null;
  const supportsCreate = Boolean(
    definition.add && create && (create.render || create.renderRow || create.onOpen),
  );
  const createFormId = `entity-create-${useId().replace(/:/g, "")}`;
  const inlineCreating = Boolean(adding && create?.renderRow);

  // `sideList` is an object prop with a fresh identity every render, so the
  // observer effect below may only depend on whether one is present.
  const hasSideList = Boolean(sideList);

  // List mode fits the viewport, so it has to know how wide the viewport is.
  useEffect(() => {
    const element = tableViewportRef.current;
    if (!element) return;
    setViewportWidth(element.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (typeof width === "number") setViewportWidth(width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [viewMode, hasSideList]);

  const columnWidth = (column: EntityListColumn<Row>) =>
    columnWidths[column.key] ?? column.minWidth ?? DEFAULT_COLUMN_MIN_WIDTH;

  // Table mode is as wide as its columns; the viewport scrolls to reach them.
  const tableWidth = (selectionMode === "multi" ? SELECTION_COLUMN_WIDTH : 0)
    + definition.columns.reduce((total, column) => total + columnWidth(column), 0);

  /**
   * How many leading columns fit the viewport in list mode. Null whenever
   * nothing needs dropping — table mode, an unmeasured viewport, or a table
   * that already fits. At least one column always survives.
   *
   * Measured against each column's CURRENT width, so a width dragged in table
   * mode carries over: narrowing columns there fits more of them here.
   */
  const fittedColumnCount = (() => {
    if (viewMode !== "list" || viewportWidth <= 0) return null;
    let remaining = viewportWidth - (selectionMode === "multi" ? SELECTION_COLUMN_WIDTH : 0);
    let fitted = 0;
    for (const column of definition.columns) {
      remaining -= columnWidth(column);
      if (remaining < 0) break;
      fitted += 1;
    }
    fitted = Math.max(1, fitted);
    return fitted >= definition.columns.length ? null : fitted;
  })();

  /** 1-based cell position the generated rule starts hiding from. */
  const hiddenFromNthChild = fittedColumnCount == null
    ? null
    : (selectionMode === "multi" ? 1 : 0) + fittedColumnCount + 1;

  // A <col> for a hidden column would still reserve width under
  // `table-layout: fixed`, so dropped columns get no <col> at all and the
  // surviving ones share the width evenly.
  const layoutColumns = fittedColumnCount == null
    ? definition.columns
    : definition.columns.slice(0, fittedColumnCount);
  const changing = adding || Boolean(editingId) || deleting || Boolean(busyCommand) || Boolean(panelCommand);
  const createEnabled = Boolean(supportsCreate && canCreate && !changing);
  const editEnabled = Boolean(
    definition.edit
      && edit
      && edit.canEdit !== false
      && selectedRows.length === 1
      && !changing,
  );
  const deleteEnabled = Boolean(
    definition.delete
      && deleteAction
      && canDelete
      && selectedRows.length > 0
      && !deleteAction.disabled?.(selectedRows)
      && !changing,
  );
  const commandContext: EntityListCommandContext<Row> = {
    rows,
    selectedRows,
    selectedIds: selection.selectedIds,
    clearSelection: selection.clear,
    refreshing,
    mutate,
    mutationAction,
  };

  useEffect(() => onRowsChange?.(rows), [onRowsChange, rows]);
  const resolvedDescription = typeof description === "function" ? description(rows) : description;
  function openCreate() {
    if (create?.onOpen) {
      create.onOpen();
      return;
    }
    setAdding(true);
  }

  async function confirmDelete() {
    if (!deleteAction || selectedRows.length === 0) return;
    setDeleting(true);
    try {
      const deleted = await mutate(
        () => deleteAction.action(selectedRows.map(getId), selectedRows),
        {
          onSuccess: () => {
            selection.clear();
            setConfirmingDelete(false);
          },
        },
      );
      if (!deleted) setConfirmingDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  async function runCommand(command: EntityListCommand<Row>) {
    if (!command.run || command.disabled?.(commandContext)) return;
    setBusyCommand(command.id);
    try {
      await mutate(() => command.run!(commandContext), {
        onSuccess: () => {
          selection.clear();
          setConfirmingCommand(null);
        },
      });
    } finally {
      setBusyCommand(null);
    }
  }

  if (tabs) {
    return (
      <EntityListTabs
        label={tabs.label}
        defaultTab={tabs.defaultTab}
        tabs={tabs.items.map((tab) => {
          const matchingRows = rows.filter(tab.filter);
          const tabRows = tab.limit == null ? matchingRows : matchingRows.slice(0, tab.limit);
          return {
            id: tab.id,
            label: tab.label,
            count: tab.count?.(tabRows) ?? String(tabRows.length),
            content: (
              <EntityListPanel
                scope={`${scope}-${tab.id}`}
                initialRows={tabRows}
                definition={tab.definition ?? definition}
                getId={getId}
                rowLabel={rowLabel}
                canCreate={canCreate}
                create={create}
                createPlacement={createPlacement}
                edit={edit}
                canDelete={canDelete}
                deleteAction={deleteAction}
                commands={tab.commands ?? commands}
                title={tab.title ?? title}
                description={tab.description ?? resolvedDescription}
                actions={actions}
                summary={summary}
                beforeTable={beforeTable}
                footer={footer}
                emptyMessage={tab.emptyMessage ?? emptyMessage}
                filteredEmptyMessage={tab.filteredEmptyMessage ?? filteredEmptyMessage}
                className={tab.className ?? className}
                headerClassName={tab.headerClassName ?? headerClassName}
                rowClassName={tab.rowClassName ?? rowClassName}
                chrome={chrome}
                searchPanelId={searchPanelId}
                rows={tabRows}
                refreshing={refreshing}
                mutate={mutate}
                mutationAction={mutationAction}
              />
            ),
          };
        })}
      />
    );
  }

  if (render) {
    return <>{render({ ...commandContext, visibleRows, controls, selection })}</>;
  }

  const activePanelCommand = commands.find((command) => command.id === panelCommand && command.panel);
  const sideSortColumn = sideList?.sortColumnKey
    ? definition.columns.find((column) => column.key === sideList.sortColumnKey)
    : undefined;
  const Surface = sideList ? ListSidePanel : ListSurface;
  const recordsOnly = chrome === "records-only";

  return (
    <Surface
      title={recordsOnly ? undefined : title ?? "Records"}
      description={recordsOnly ? undefined : resolvedDescription}
      onCreate={!recordsOnly && supportsCreate && createPlacement === "header" ? openCreate : undefined}
      canCreate={createEnabled}
      createDisabledReason={create?.disabledReason ?? (canCreate ? "Finish the current list action first." : "You do not have permission to create this record.")}
      createLabel={create?.label ?? "New"}
      actions={recordsOnly ? undefined : typeof actions === "function" ? actions(rows) : actions}
      refreshing={refreshing}
      className={className}
      headerClassName={headerClassName}
    >
      {!recordsOnly && (
        <ListCommandToolbar
          mode={selectionMode}
          count={selection.selectedCount}
          showSelectionSummary={sideList?.showSelectionSummary}
          enableCreate={Boolean(supportsCreate && createPlacement === "toolbar" && !adding)}
          onCreate={{
            label: create?.label,
            onClick: () => {
              setEditingId(null);
              openCreate();
            },
            disabled: !createEnabled,
          }}
          enableEdit={Boolean(definition.edit && edit && edit.canEdit !== false)}
          onEdit={{
            label: edit?.label,
            onClick: () => setEditingId(getId(selectedRows[0])),
            disabled: !editEnabled,
          }}
          enableDelete={Boolean(definition.delete && deleteAction && canDelete)}
          onDelete={{
            onClick: () => setConfirmingDelete(true),
            disabled: !deleteEnabled,
            busy: deleting,
            label: deleteAction?.disabledReason?.(selectedRows) ? "Delete" : undefined,
          }}
        >
          {sideSortColumn && <SortButton col={sideSortColumn} controls={controls} />}
          {inlineCreating && (
            <>
              <button type="button" onClick={() => setAdding(false)} className="min-h-10 rounded-full border border-stone-300 px-4 text-sm font-semibold dark:border-stone-600">
                Cancel
              </button>
              <button form={createFormId} className="min-h-10 rounded-full bg-green-700 px-4 text-sm font-semibold text-white">
                Save
              </button>
            </>
          )}
          {editingRow && edit && !edit.renderPanel && (
            <>
              <button type="button" onClick={() => setEditingId(null)} className="min-h-10 rounded-full border border-stone-300 px-4 text-sm font-semibold dark:border-stone-600">
                Cancel
              </button>
              <button form={edit.formId?.(editingRow) ?? `entity-edit-${getId(editingRow)}`} className="min-h-10 rounded-full bg-green-700 px-4 text-sm font-semibold text-white">
                {edit.saveLabel ?? "Save"}
              </button>
            </>
          )}
          {commands.filter((command) => command.visible !== false).map((command) => {
            const disabled = changing || Boolean(command.disabled?.(commandContext));
            const label = typeof command.label === "function" ? command.label(commandContext) : command.label;
            const titleText = command.disabledReason?.(commandContext);
            return (
              <button
                key={command.id}
                type="button"
                title={titleText}
                disabled={disabled}
                onClick={() => {
                  if (command.panel) setPanelCommand(command.id);
                  else if (command.confirm) setConfirmingCommand(command.id);
                  else void runCommand(command);
                }}
                className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  command.destructive
                    ? "border-red-200 bg-white text-red-700 hover:bg-red-50 dark:border-red-900 dark:bg-stone-900 dark:text-red-300 dark:hover:bg-red-950"
                    : "border-stone-300 bg-white text-stone-700 hover:bg-green-50 hover:text-green-800 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-green-950 dark:hover:text-green-300"
                }`}
              >
                {busyCommand === command.id && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
                {busyCommand === command.id ? command.pendingLabel ?? "Working…" : label}
              </button>
            );
          })}
          {/* Last, so it sits at the far right of the list's toolbar. A
              display preference, kept apart from the record commands. */}
          {!sideList && <ListViewModeMenu mode={viewMode} onChange={setViewMode} />}
        </ListCommandToolbar>
      )}

      {supportsCreate && create?.render && !create.renderRow && (
        <ListCreatePanel open={adding} title={create.panelTitle ?? create.label ?? "Add record"} className={create.panelClassName}>
          {create.render({
            action: mutationAction(create.action, {
              onSuccess: () => {
                create.onSuccess?.();
                setAdding(false);
              },
            }),
            close: () => setAdding(false),
            rows,
          })}
        </ListCreatePanel>
      )}

      {activePanelCommand?.panel && (
        <ListCreatePanel
          open
          title={typeof activePanelCommand.panel.title === "function"
            ? activePanelCommand.panel.title(commandContext)
            : activePanelCommand.panel.title}
        >
          {activePanelCommand.panel.render({
            action: mutationAction(
              (formData) => activePanelCommand.panel!.action(formData, commandContext),
              {
                onSuccess: () => {
                  selection.clear();
                  setPanelCommand(null);
                },
              },
            ),
            close: () => setPanelCommand(null),
            command: commandContext,
          })}
        </ListCreatePanel>
      )}

      {editingRow && edit?.renderPanel && (
        <ListCreatePanel open title={edit.label ?? "Edit record"}>
          {edit.renderPanel({
            row: editingRow,
            action: mutationAction(
              (formData) => edit.action(editingRow, formData),
              {
                onSuccess: () => {
                  edit.onSuccess?.(editingRow);
                  selection.clear();
                  setEditingId(null);
                },
              },
            ),
            close: () => setEditingId(null),
          })}
        </ListCreatePanel>
      )}

      {(summary ?? beforeTable)?.(rows)}
      <ListSearchPanel columns={definition.columns} controls={controls} label={sideList?.searchLabel} id={searchPanelId} listScope={scope} />
      {sideList ? (
        <div className={sideList.bodyClassName ?? "max-h-[28rem] overflow-y-auto xl:max-h-none xl:min-h-0 xl:flex-1"}>
          {visibleRows.map((row) => {
            const id = getId(row);
            const active = sideList.isActive?.(row) ?? false;
            const selected = selection.isSelected(id);
            return (
              <Link
                key={id}
                href={sideList.href(row)}
                onClick={() => {
                  selection.select(id);
                  sideList.onSelect?.(row);
                }}
                aria-current={active ? "page" : undefined}
                className={`block border-b border-stone-100 px-4 py-3 text-sm last:border-0 dark:border-stone-800 ${
                  active
                    ? "bg-green-50 text-green-950 dark:bg-green-950 dark:text-green-100"
                    : selected
                      ? "bg-green-50/60 dark:bg-green-950/20"
                      : "hover:bg-stone-50 dark:hover:bg-stone-800/60"
                }`}
              >
                {sideList.content(row, { active, selected })}
              </Link>
            );
          })}
          {visibleRows.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-stone-400 dark:text-stone-500">
              {rows.length ? filteredEmptyMessage : emptyMessage}
            </p>
          )}
        </div>
      ) : (
        <div ref={tableViewportRef} className={viewMode === "table" ? "list-scroll-x" : "list-scroll-none"}>
          {inlineCreating && create ? (
            <form
              id={createFormId}
              onSubmit={handleInlineFormSubmit(mutationAction(create.action, {
                onSuccess: () => {
                  create.onSuccess?.();
                  setAdding(false);
                },
              }))}
            />
          ) : null}
          {/*
            List mode hides the columns that do not fit with a generated rule
            rather than by rendering fewer cells. A create row's cells come
            from the page's own renderRow, so dropping cells here would leave
            the draft row wider than its header; one rule over every cell of
            this table keeps header, body, draft row and footer aligned.
          */}
          {hiddenFromNthChild != null && (
            <style>{`#${tableId} > thead > tr > *:nth-child(n+${hiddenFromNthChild}),#${tableId} > tbody > tr > *:nth-child(n+${hiddenFromNthChild}),#${tableId} > tfoot > tr > *:nth-child(n+${hiddenFromNthChild}){display:none}`}</style>
          )}
          <table
            id={tableId}
            className="list-fixed-layout list-single-line text-sm"
            // Table mode is exactly as wide as its columns — no `minWidth:100%`,
            // which would stretch a narrow table back over the viewport and
            // silently undo every attempt to drag a column narrower.
            // List mode fills the viewport, distributing any slack across the
            // columns that fit while keeping their relative widths.
            style={viewMode === "table" ? { width: `${tableWidth}px` } : { width: "100%" }}
          >
          <colgroup>
            {selectionMode === "multi" ? <col style={{ width: SELECTION_COLUMN_WIDTH }} /> : null}
            {layoutColumns.map((column) => (
              <col key={column.key} style={{ width: columnWidth(column) }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
              <ListSelectionHeader
                mode={selectionMode}
                scope={scope}
                checked={selection.allVisibleSelected(visibleRows)}
                onChange={() => selection.toggleVisible(visibleRows)}
                disabled={changing || refreshing}
              />
              {definition.columns.map((column) => (
                <th
                  key={column.key}
                  title={typeof column.label === "string" ? column.label : undefined}
                  className={["relative px-4 py-3", column.headerClassName].filter(Boolean).join(" ")}
                >
                  {column.sortable ? <SortButton col={column} controls={controls} /> : column.label}
                  {viewMode === "table" && (
                    <ColumnResizeHandle
                      label={typeof column.label === "string" ? column.label : column.key}
                      width={columnWidth(column)}
                      minWidth={MIN_RESIZE_WIDTH}
                      onResize={(next) => setColumnWidth(column.key, next)}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {inlineCreating && create?.renderRow ? (
              <tr className="border-b border-green-200 bg-green-50/70 align-top dark:border-green-900 dark:bg-green-950/20">
                {selectionMode === "multi" ? <td className="w-12 px-4 py-3" /> : null}
                {create.renderRow({ formId: createFormId, rows })}
              </tr>
            ) : null}
            {visibleRows.map((row) => {
              const id = getId(row);
              const editing = editingId === id;
              const formId = editing ? edit?.formId?.(row) ?? `entity-edit-${id}` : null;
              const cellContext = { editing, formId, refreshing };
              return (
                <tr
                  key={id}
                  {...selection.rowProps(id, changing || refreshing)}
                  className={[
                    "cursor-pointer border-b border-stone-100 align-top last:border-0 dark:border-stone-800",
                    selection.isSelected(id) ? "bg-green-50/60 dark:bg-green-950/20" : "",
                    rowClassName?.(row, { ...cellContext, selected: selection.isSelected(id) }),
                  ].filter(Boolean).join(" ")}
                >
                  <ListSelectionCell
                    mode={selectionMode}
                    scope={scope}
                    id={id}
                    label={rowLabel(row)}
                    checked={selection.isSelected(id)}
                    onChange={() => selection.toggle(id)}
                    disabled={changing || refreshing}
                  />
                  {definition.columns.map((column, index) => (
                    <td
                      key={column.key}
                      // Truncated text is unreadable without the whole value,
                      // so every cell carries it. Skipped while editing: the
                      // cell is an input the user is already reading.
                      title={editing ? undefined : cellTitle(column, row)}
                      className={["px-4 py-3", column.cellClassName].filter(Boolean).join(" ")}
                    >
                      {editing && edit && formId && index === 0 && (
                        <form
                          id={formId}
                          onSubmit={handleInlineFormSubmit(mutationAction(
                            (formData) => edit.action(row, formData),
                            {
                              onSuccess: () => {
                                edit.onSuccess?.(row);
                                selection.clear();
                                setEditingId(null);
                              },
                            },
                          ))}
                        />
                      )}
                      {editing && formId && (column.edit || (column.lovSource && column.lovEdit))
                        ? editCellContent(column, row, formId)
                        : column.render
                          ? column.render(row, cellContext)
                          : String(column.accessor?.(row) ?? "—")}
                    </td>
                  ))}
                </tr>
              );
            })}
            {visibleRows.length === 0 && !inlineCreating && (
              <tr>
                <td colSpan={definition.columns.length + (selectionMode === "multi" ? 1 : 0)} className="px-4 py-8 text-center text-stone-400">
                  {rows.length ? filteredEmptyMessage : emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
          {footer && rows.length > 0 && (
            <tfoot>{footer({ rows, visibleRows, selectionColumn: selectionMode === "multi" })}</tfoot>
          )}
          </table>
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center border-t border-stone-100 py-3 dark:border-stone-800">
          <button
            type="button"
            onClick={() => void loadMore?.()}
            disabled={loadingMore}
            className="inline-flex min-h-9 items-center gap-2 rounded-full border border-stone-300 px-4 text-sm font-semibold text-stone-700 transition hover:bg-green-50 hover:text-green-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-green-950 dark:hover:text-green-300"
          >
            {loadingMore && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
            {loadingMore ? "Loading…" : "Show more"}
          </button>
        </div>
      )}

      {deleteAction && (
        <ConfirmationDialog
          open={confirmingDelete}
          title={deleteAction.title?.(selectedRows.length) ?? `Delete ${selectedRows.length} record${selectedRows.length === 1 ? "" : "s"}?`}
          description={deleteAction.description?.(selectedRows) ?? "This action cannot be undone."}
          confirmLabel={deleteAction.confirmLabel ?? "Delete"}
          destructive
          busy={deleting}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={confirmDelete}
        />
      )}

      {commands.filter((command) => command.confirm).map((command) => (
        <ConfirmationDialog
          key={command.id}
          open={confirmingCommand === command.id}
          title={typeof command.confirm!.title === "function" ? command.confirm!.title(commandContext) : command.confirm!.title}
          description={typeof command.confirm!.description === "function" ? command.confirm!.description(commandContext) : command.confirm!.description}
          confirmLabel={command.confirm!.confirmLabel ?? (typeof command.label === "function" ? command.label(commandContext) : command.label)}
          destructive={command.destructive}
          busy={busyCommand === command.id}
          onCancel={() => setConfirmingCommand(null)}
          onConfirm={() => { void runCommand(command); }}
        />
      ))}
    </Surface>
  );
}
