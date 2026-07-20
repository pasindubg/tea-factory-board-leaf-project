"use client";

import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { showAppToast } from "@/components/action-feedback";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
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
  type ListDefinition,
} from "@/components/list-controls";
import { ENTITY_LIST_METADATA } from "@/lib/entity-list-metadata";
import type { ListMutationResult } from "@/lib/list-mutations";
import type { ListResourceKey, ListResourceRequest, ListResourceRow } from "@/lib/list-resources";

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
  const data = useLocalEntityListData(props.initialRows);
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

function useLocalEntityListData<Row>(initialRows: Row[]): EntityListDataContext<Row> {
  const [rows, setRows] = useState(initialRows);
  useEffect(() => setRows(initialRows), [initialRows]);

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

  return { rows, refreshing: false, mutate, mutationAction };
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
  createPlacement = "header",
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
}: EntityListPanelProps<Row>) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busyCommand, setBusyCommand] = useState<string | null>(null);
  const [confirmingCommand, setConfirmingCommand] = useState<string | null>(null);
  const [panelCommand, setPanelCommand] = useState<string | null>(null);
  const controls = useListControls(rows, definition.columns, listControls);
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
      <ListSearchPanel columns={definition.columns} controls={controls} label={sideList?.searchLabel} id={searchPanelId} />
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
        <div className="overflow-x-auto">
          {inlineCreating && create ? (
            <form
              id={createFormId}
              action={mutationAction(create.action, {
                onSuccess: () => {
                  create.onSuccess?.();
                  setAdding(false);
                },
              })}
            />
          ) : null}
          <table className="w-full text-sm">
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
                <th key={column.key} className={["px-4 py-3", column.headerClassName].filter(Boolean).join(" ")}>
                  {column.sortable ? <SortButton col={column} controls={controls} /> : column.label}
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
                    <td key={column.key} className={["px-4 py-3", column.cellClassName].filter(Boolean).join(" ")}>
                      {editing && edit && formId && index === 0 && (
                        <form
                          id={formId}
                          action={mutationAction(
                            (formData) => edit.action(row, formData),
                            {
                              onSuccess: () => {
                                edit.onSuccess?.(row);
                                selection.clear();
                                setEditingId(null);
                              },
                            },
                          )}
                        />
                      )}
                      {editing && column.edit && formId
                        ? column.edit(row, { formId })
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
