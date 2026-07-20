"use client";

import { useState } from "react";
import { EntityList } from "@/components/entity-list";
import { ListSearchPanel, ListSurface, SortButton, type ColumnDef, type ListDefinition } from "@/components/list-controls";
import { SubmitButton } from "@/components/submit-button";
import type { RolePagePermissionListRow } from "@/lib/list-resources";
import { saveRolePagePermissions } from "./actions";

const ACTIONS = ["view", "create", "update", "delete"] as const;
type Action = (typeof ACTIONS)[number];
type Draft = Record<string, Record<Action, boolean>>;

const columns: ColumnDef<RolePagePermissionListRow>[] = [
  { key: "group", label: "Section", accessor: (row) => row.group },
  { key: "page", label: "Page", accessor: (row) => row.label },
  ...ACTIONS.map((action) => ({ key: action, label: action, accessor: (row: RolePagePermissionListRow) => row[`can${action[0].toUpperCase()}${action.slice(1)}` as "canView"] ? "allowed" : "restricted" })),
];
const definition = { columns, selectionMode: "single", add: false, edit: false, delete: false } satisfies ListDefinition<RolePagePermissionListRow>;

function initialDraft(rows: RolePagePermissionListRow[]): Draft {
  return Object.fromEntries(rows.map((row) => [row.key, {
    view: row.canView,
    create: row.canCreate,
    update: row.canUpdate,
    delete: row.canDelete,
  }]));
}

export function RolePermissionsMatrix({ roleId, initialRows }: { roleId: string; initialRows: RolePagePermissionListRow[] }) {
  const [draft, setDraft] = useState<Draft>(() => initialDraft(initialRows));
  const update = (pageKey: string, action: Action, checked: boolean) => setDraft((current) => ({
    ...current,
    [pageKey]: { ...(current[pageKey] ?? { view: false, create: false, update: false, delete: false }), [action]: checked, ...(action !== "view" && checked ? { view: true } : {}) },
  }));

  return (
    <EntityList
      resource={{ key: "users.role-page-permissions", params: { roleId } }}
      initialRows={initialRows}
      definition={definition}
      getId={(row) => row.key}
      rowLabel={(row) => row.label}
      emptyMessage="No dashboard pages are registered."
      renderMode="matrix"
      render={({ rows, visibleRows, refreshing, mutationAction, controls }) => (
        <form action={mutationAction(saveRolePagePermissions)}>
          <input type="hidden" name="role_id" value={roleId} />
          {rows.flatMap((row) => ACTIONS.filter((action) => draft[row.key]?.[action]).map((action) => <input key={`${row.key}-${action}`} type="hidden" name={`perm_${row.key}_${action}`} value="on" />))}
          <ListSurface
            title="Page and action access"
            description="Choose the pages this role can open and the actions it can perform. Disabled cells exceed its database security level."
            refreshing={refreshing}
            actions={<SubmitButton pendingText="Saving…" className="min-h-10 rounded-full bg-green-700 px-5 text-sm font-semibold text-white hover:bg-green-800 dark:bg-green-500 dark:text-green-950">Save access</SubmitButton>}
          >
            <ListSearchPanel columns={columns} controls={controls} label="Search pages" />
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
              <th className="px-4 py-3"><SortButton col={columns[0]} controls={controls} /></th><th className="px-4 py-3"><SortButton col={columns[1]} controls={controls} /></th>
              {ACTIONS.map((action) => <th key={action} className="px-4 py-3 text-center"><SortButton col={columns.find((column) => column.key === action)!} controls={controls} /></th>)}
            </tr></thead><tbody>{visibleRows.map((row) => <tr key={row.key} className="border-b border-stone-100 last:border-0 dark:border-stone-800"><td className="px-4 py-3 text-stone-500 dark:text-stone-400">{row.group}</td><td className="px-4 py-3"><p className="font-medium text-stone-900 dark:text-stone-100">{row.label}</p><p className="text-xs text-stone-400">{row.href}</p></td>{ACTIONS.map((action) => {
              const permitted = row.allowedActions.includes(action);
              return <td key={action} className="px-4 py-3 text-center">{permitted ? <input type="checkbox" aria-label={`${action} ${row.label}`} checked={draft[row.key]?.[action] ?? false} onChange={(event) => update(row.key, action, event.target.checked)} className="h-4 w-4 rounded border-stone-300 text-green-600 focus:ring-green-600 dark:border-stone-600 dark:text-green-400" /> : <span className="text-stone-300 dark:text-stone-600">—</span>}</td>;
            })}</tr>)}{visibleRows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-stone-400">No pages match these filters.</td></tr>}</tbody></table></div>
          </ListSurface>
        </form>
      )}
    />
  );
}
