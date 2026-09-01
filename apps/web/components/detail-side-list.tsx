"use client";

import { EntityList, type EntityListCreate, type EntityListSideList } from "@/components/entity-list";
import type { ColumnDef, ListDefinition } from "@/components/list-controls";
import type { ListResourceKey, ListResourceRequest, ListResourceRow } from "@/lib/list-resources";

/**
 * The shared shape for every detail-page rail (the record list beside a
 * detail page — Sale, Dispatch invoice, Physical dispatch, etc.). Always
 * registry-backed (`resource`, never a local `scope`), so every rail gets
 * the same real server-side search/lock enforcement identically instead of
 * each page choosing between the registry-backed path and the weaker
 * client-only-filter path.
 */
export function DetailSideList<Key extends ListResourceKey>({
  resource,
  initialRows,
  columns,
  getId,
  rowLabel,
  searchPanelId,
  emptyMessage,
  filteredEmptyMessage,
  sideList,
  create,
}: {
  resource: ListResourceRequest<Key>;
  initialRows: ListResourceRow<Key>[];
  columns: ColumnDef<ListResourceRow<Key>>[];
  getId: (row: ListResourceRow<Key>) => string;
  rowLabel: (row: ListResourceRow<Key>) => string;
  searchPanelId: string;
  emptyMessage: string;
  filteredEmptyMessage: string;
  sideList: EntityListSideList<ListResourceRow<Key>>;
  /** Opt-in "+ New" trigger for rails whose detail page owns its own create
   * workflow (e.g. via `onOpen` swapping the main content area) instead of
   * an inline list panel — omit for read-only/navigation-only rails. */
  create?: EntityListCreate<ListResourceRow<Key>>;
}) {
  const definition: ListDefinition<ListResourceRow<Key>> = {
    columns,
    selectionMode: "single",
    add: Boolean(create),
    edit: false,
    delete: false,
  };

  return (
    <EntityList
      resource={resource}
      initialRows={initialRows}
      definition={definition}
      getId={getId}
      rowLabel={rowLabel}
      chrome="records-only"
      searchPanelId={searchPanelId}
      className="h-full min-h-0 xl:flex-col"
      emptyMessage={emptyMessage}
      filteredEmptyMessage={filteredEmptyMessage}
      canCreate={Boolean(create)}
      create={create}
      sideList={sideList}
    />
  );
}
