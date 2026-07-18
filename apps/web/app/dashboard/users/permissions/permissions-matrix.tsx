"use client";

import { useState } from "react";
import { EntityList } from "@/components/entity-list";
import {
  ListCommandToolbar,
  ListSearchPanel,
  ListSurface,
  SortButton,
  type ColumnDef,
  type ListDefinition,
} from "@/components/list-controls";
import { SubmitButton } from "@/components/submit-button";
import type { ModulePermissionListRow } from "@/lib/list-resources";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { saveModulePermissions } from "./actions";

const CONFIGURABLE_ROLES: Role[] = ["manager", "supervisor", "accountant", "collector"];
const FORM_ID = "module-permissions-form";

const COLUMNS: ColumnDef<ModulePermissionListRow>[] = [
  { key: "module", label: "Module", accessor: (row) => row.label },
  ...CONFIGURABLE_ROLES.map((role) => ({
    key: role,
    label: ROLE_LABELS[role],
    accessor: (row: ModulePermissionListRow) => row.allowedRoles.includes(role) ? "allowed" : "restricted",
  })),
];

const LIST = {
  columns: COLUMNS,
  selectionMode: "single",
  add: false,
  edit: true,
  delete: false,
} satisfies ListDefinition<ModulePermissionListRow>;

type PermissionDraft = Record<string, Set<string>>;

function draftFromRows(rows: ModulePermissionListRow[]): PermissionDraft {
  return Object.fromEntries(rows.map((row) => [row.key, new Set(row.allowedRoles)]));
}

export function PermissionsMatrix({ initialRows }: { initialRows: ModulePermissionListRow[] }) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<PermissionDraft>(() => draftFromRows(initialRows));

  function setAllowed(moduleKey: string, role: Role, allowed: boolean) {
    setDraft((current) => {
      const next = { ...current };
      const roles = new Set(next[moduleKey] ?? []);
      if (allowed) roles.add(role);
      else roles.delete(role);
      next[moduleKey] = roles;
      return next;
    });
  }

  return (
    <EntityList
      resource={{ key: "users.module-permissions" }}
      initialRows={initialRows}
      definition={LIST}
      getId={(row) => row.key}
      rowLabel={(row) => row.label}
      emptyMessage="No configurable modules are available."
      renderMode="matrix"
      render={({ rows, visibleRows, refreshing, mutationAction, controls, selection }) => {
        const selectedModule = rows.find((row) => row.key === selection.selectedId) ?? null;
        const editingModule = rows.find((row) => row.key === editingKey) ?? null;
        const beginEditing = () => {
          if (!selectedModule) return;
          setDraft(draftFromRows(rows));
          setEditingKey(selectedModule.key);
        };
        const cancelEditing = () => {
          setDraft(draftFromRows(rows));
          setEditingKey(null);
        };
        return (
    <form
      id={FORM_ID}
      action={mutationAction(saveModulePermissions, {
        onSuccess: () => {
          setEditingKey(null);
          selection.clear();
        },
      })}
    >
      {rows.flatMap((row) =>
        row.configurableRoles
          .filter((role) => (draft[row.key] ?? new Set(row.allowedRoles)).has(role))
          .map((role) => (
            <input key={`${row.key}-${role}`} type="hidden" name={`perm_${row.key}_${role}`} value="on" />
          )),
      )}

      <ListSurface
        title="Module access matrix"
        description="Select a module, then edit the roles allowed to open it."
        refreshing={refreshing}
      >
        <ListCommandToolbar
          mode={LIST.selectionMode}
          count={selection.selectedCount}
          enableEdit={Boolean(LIST.edit) && !editingKey}
          onEdit={{
            label: "Edit",
            onClick: beginEditing,
            disabled: !selectedModule,
          }}
        >
          {editingModule && (
            <>
              <button
                type="button"
                onClick={cancelEditing}
                className="min-h-10 rounded-full border border-stone-300 px-4 text-sm font-semibold text-stone-700 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
              >
                Cancel
              </button>
              <SubmitButton
                pendingText="Saving…"
                className="min-h-10 rounded-full bg-green-700 px-5 text-sm font-semibold text-white hover:bg-green-800 dark:bg-green-500 dark:text-green-950"
              >
                Save
              </SubmitButton>
              <span className="self-center text-sm font-semibold text-green-800 dark:text-green-300">
                {editingModule.label}
              </span>
            </>
          )}
        </ListCommandToolbar>
        <ListSearchPanel columns={LIST.columns} controls={controls} label="Search modules" />

        <div data-settings-grid className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
                <th className="w-48 px-4 py-3"><SortButton col={LIST.columns[0]} controls={controls} /></th>
                {CONFIGURABLE_ROLES.map((role) => (
                  <th key={role} className="px-4 py-3 text-center"><SortButton col={LIST.columns.find((column) => column.key === role)!} controls={controls} /></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((module) => {
                const isEditing = editingKey === module.key;
                const allowedRoles = draft[module.key] ?? new Set(module.allowedRoles);
                return (
                  <tr
                    key={module.key}
                    {...selection.rowProps(module.key, Boolean(editingKey))}
                    className={`cursor-pointer border-b border-stone-100 last:border-0 dark:border-stone-800 ${selection.isSelected(module.key) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}
                  >
                    <td className="px-4 py-3 font-medium text-stone-900 dark:text-stone-100">{module.label}</td>
                    {CONFIGURABLE_ROLES.map((role) => {
                      if (!module.configurableRoles.includes(role)) {
                        return <td key={role} className="px-4 py-3 text-center text-xs text-stone-300 dark:text-stone-600">—</td>;
                      }
                      return (
                        <td key={role} className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            aria-label={`${ROLE_LABELS[role]} access to ${module.label}`}
                            checked={allowedRoles.has(role)}
                            disabled={!isEditing}
                            onChange={(event) => setAllowed(module.key, role, event.target.checked)}
                            className="h-4 w-4 rounded border-stone-300 text-green-600 focus:ring-green-600 disabled:opacity-60 dark:border-stone-600 dark:text-green-400"
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {visibleRows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">{rows.length === 0 ? "No configurable modules are available." : "No modules match these filters."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </ListSurface>
    </form>
        );
      }}
    />
  );
}
