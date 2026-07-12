"use client";

import { SubmitButton } from "@/components/submit-button";
import { ROLE_LABELS } from "@/lib/roles";
import { setUserActive, resetUserPassword } from "./actions";
import { RemoveUserButton } from "./remove-user-button";
import { ListCommandToolbar, useListControls, SortButton, ListSearchPanel, ListSelectionCell, ListSelectionHeader, useListSelection, type ColumnDef, type ListSelectionMode } from "@/components/list-controls";

const roleBadge: Record<string, string> = {
  owner:      "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-400",
  manager:    "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-400",
  supervisor: "bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-400",
  accountant: "bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-400",
  collector:  "bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300",
};

const inputClass =
  "rounded-md border border-stone-300 dark:border-stone-600 px-2 py-1 text-sm focus:border-green-600 dark:focus:border-green-500 focus:outline-none";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: string;
  active: boolean;
};

const COLUMNS: ColumnDef<UserRow>[] = [
  { key: "name", label: "Name", accessor: (r) => r.name, sortable: true, filter: "text", lov: false },
  { key: "email", label: "Email", accessor: (r) => r.email, sortable: true, filter: "text", lov: false },
  { key: "username", label: "Username", accessor: (r) => r.username ?? null, sortable: true, filter: "text", lov: false },
  { key: "role", label: "Role", accessor: (r) => r.role, sortable: true, filter: "select", filterOptions: Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label })) },
  { key: "active", label: "Status", accessor: (r) => (r.active ? "active" : "inactive"), sortable: true, filter: "select", filterOptions: [{ value: "active", label: "active" }, { value: "inactive", label: "inactive" }] },
];
// Credential/reset/remove operations are deliberately single-record actions.
const SELECTION_MODE: ListSelectionMode = "single";

export function UsersTable({ rows, currentUserId, isOwner }: { rows: UserRow[]; currentUserId: string; isOwner: boolean }) {
  const controls = useListControls(rows, COLUMNS);
  const visibleRows = controls.rows;
  const selection = useListSelection(rows, { mode: SELECTION_MODE, getId: (row) => row.id });
  const selectedUser = rows.find((row) => row.id === selection.selectedId) ?? null;

  return (
    <div data-selection-mode={SELECTION_MODE} className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
      <ListCommandToolbar mode={SELECTION_MODE} count={selection.selectedCount}>
        {selectedUser && <span className="text-sm font-semibold text-green-800 dark:text-green-300">{selectedUser.name}</span>}
      </ListCommandToolbar>
      <ListSearchPanel columns={COLUMNS} controls={controls} />
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
            <ListSelectionHeader mode={SELECTION_MODE} scope="users" />
            {COLUMNS.map((col) => (
              <th key={col.key} className="px-4 py-3">
                {col.sortable ? <SortButton col={col} controls={controls} /> : col.label}
              </th>
            ))}
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((u) => {
            const isSelf = u.id === currentUserId;
            const isOwnerRow = u.role === "owner";
            const canAct = !isSelf && (isOwner || !isOwnerRow);

            return (
              <tr key={u.id} {...selection.rowProps(u.id)} className={`cursor-pointer border-b border-stone-100 dark:border-stone-800 last:border-0 ${selection.isSelected(u.id) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}>
                <ListSelectionCell mode={SELECTION_MODE} scope="users" name="selected_user" id={u.id} label={u.name} checked={selection.isSelected(u.id)} onChange={() => selection.select(u.id)} />
                <td className="px-4 py-3 font-medium">
                  {u.name}
                  {isSelf && <span className="ml-2 text-xs font-normal text-stone-400 dark:text-stone-500">(you)</span>}
                </td>
                <td className="px-4 py-3 text-stone-600 dark:text-stone-400">{u.email}</td>
                <td className="px-4 py-3 text-stone-500 dark:text-stone-400">{u.username ?? <span className="italic text-stone-300 dark:text-stone-600">none</span>}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${roleBadge[u.role] ?? ""}`}>
                    {ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] ?? u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      u.active ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-400" : "bg-stone-200 text-stone-600 dark:text-stone-400"
                    }`}
                  >
                    {u.active ? "active" : "inactive"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {canAct && (
                    <details className="group relative">
                      <summary className="cursor-pointer list-none text-sm text-green-700 dark:text-green-400 hover:underline">
                        Actions ▾
                      </summary>
                      <div className="absolute right-0 z-10 mt-1 w-64 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-3 shadow-md">
                        <form action={setUserActive} className="mb-2">
                          <input type="hidden" name="user_id" value={u.id} />
                          <input type="hidden" name="next_active" value={u.active ? "false" : "true"} />
                          <SubmitButton pendingText="…" className="w-full rounded-md border border-stone-200 dark:border-stone-700 px-3 py-1.5 text-left text-sm hover:bg-stone-50 dark:hover:bg-stone-800">
                            {u.active ? "Deactivate" : "Reactivate"}
                          </SubmitButton>
                        </form>

                        <form action={resetUserPassword} className="space-y-2 border-t border-stone-100 dark:border-stone-800 pt-2">
                          <input type="hidden" name="user_id" value={u.id} />
                          <p className="text-xs font-medium text-stone-500 dark:text-stone-400">Set credentials</p>
                          <input
                            name="username"
                            placeholder="Username"
                            defaultValue={u.username ?? ""}
                            autoComplete="off"
                            className={`${inputClass} w-full`}
                          />
                          <input
                            name="password"
                            type="password"
                            placeholder="New password"
                            autoComplete="new-password"
                            className={`${inputClass} w-full`}
                          />
                          <SubmitButton pendingText="Saving…" className="w-full rounded-md bg-green-700 dark:bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-800 dark:hover:bg-green-700">
                            Save
                          </SubmitButton>
                        </form>

                        <div className="border-t border-stone-100 dark:border-stone-800 pt-2">
                          <RemoveUserButton userId={u.id} userName={u.name} />
                        </div>
                      </div>
                    </details>
                  )}
                </td>
              </tr>
            );
          })}
          {visibleRows.length === 0 && rows.length > 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">
                No users match these filters.
              </td>
            </tr>
          )}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">
                No users yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
