"use client";

import { useRef, useState } from "react";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import {
  ListCommandToolbar,
  ListCreatePanel,
  ListSearchPanel,
  ListSurface,
  SortButton,
  useFrameworkListData,
  useListControls,
  useListSelection,
  type ColumnDef,
  type ListDefinition,
} from "@/components/list-controls";
import { SubmitButton } from "@/components/submit-button";
import type { UserAccountListRow } from "@/lib/list-resources";
import { ROLE_LABELS } from "@/lib/roles";
import { createUser, removeUser, resetUserPassword, setUserActive } from "./actions";

const roleBadge: Record<string, string> = {
  owner: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-400",
  manager: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-400",
  supervisor: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-400",
  accountant: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-400",
  collector: "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300",
  supplier: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300",
  driver: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
};

const COLUMNS: ColumnDef<UserAccountListRow>[] = [
  { key: "name", label: "Name", accessor: (row) => row.name, sortable: true, filter: "text", lov: false },
  { key: "email", label: "Email", accessor: (row) => row.email, sortable: true, filter: "text", lov: false },
  { key: "username", label: "Username", accessor: (row) => row.username, sortable: true, filter: "text", lov: false },
  {
    key: "role",
    label: "Role",
    accessor: (row) => row.role,
    sortable: true,
    filter: "select",
    filterOptions: Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label })),
  },
  {
    key: "active",
    label: "Status",
    accessor: (row) => row.active ? "active" : "inactive",
    sortable: true,
    filter: "select",
    filterOptions: [
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
    ],
  },
];

const LIST = {
  columns: COLUMNS,
  selectionMode: "single",
  add: true,
  edit: false,
  delete: true,
  commands: [
    { id: "active", label: "Activate / deactivate", requiresSelection: true },
    { id: "credentials", label: "Set credentials", requiresSelection: true },
  ],
} satisfies ListDefinition<UserAccountListRow>;

const inputClass = "w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-green-600 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100";
const secondaryButton = "min-h-10 rounded-full border border-stone-300 px-4 text-sm font-semibold text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800";

export function UsersTable({
  initialRows,
  currentUserId,
}: {
  initialRows: UserAccountListRow[];
  currentUserId: string;
}) {
  const [adding, setAdding] = useState(false);
  const [credentialsUserId, setCredentialsUserId] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const createFormRef = useRef<HTMLFormElement>(null);
  const { rows, refreshing, mutate, mutationAction } = useFrameworkListData({
    initialRows,
    resource: { key: "users.accounts" },
  });
  const controls = useListControls(rows, LIST.columns);
  const selection = useListSelection(rows, {
    mode: LIST.selectionMode,
    getId: (row) => row.id,
  });
  const selectedUser = rows.find((row) => row.id === selection.selectedId) ?? null;
  const credentialsUser = rows.find((row) => row.id === credentialsUserId) ?? null;
  const selectedIsSelf = selectedUser?.id === currentUserId;
  const changingRecord = adding || Boolean(credentialsUserId) || removing;
  const commandDisabled = !selectedUser || selectedIsSelf || changingRecord;

  async function handleRemove() {
    if (!selectedUser || selectedIsSelf) return;
    setRemoving(true);
    const formData = new FormData();
    formData.set("user_id", selectedUser.id);
    const succeeded = await mutate(() => removeUser(formData), {
      onSuccess: () => selection.clear(),
    });
    if (succeeded) setConfirmingRemove(false);
    setRemoving(false);
  }

  function closeCreate() {
    createFormRef.current?.reset();
    setAdding(false);
  }

  return (
    <>
      <ListSurface
        title="User accounts"
        description="Factory users, login identifiers, roles, and account status."
        onCreate={() => setAdding(true)}
        canCreate={Boolean(LIST.add) && !adding && !credentialsUserId && !removing}
        createDisabledReason="Finish the current user change first."
        createLabel="New user"
        refreshing={refreshing}
      >
        <ListCommandToolbar
          mode={LIST.selectionMode}
          count={selection.selectedCount}
          enableDelete={Boolean(LIST.delete)}
          onDelete={{
            label: "Remove",
            onClick: () => setConfirmingRemove(true),
            disabled: commandDisabled,
            busy: removing,
          }}
        >
          <form
            action={mutationAction(setUserActive, { onSuccess: selection.clear })}
            title={selectedIsSelf ? "You cannot change your own account here." : undefined}
          >
            <input type="hidden" name="user_id" value={selectedUser?.id ?? ""} />
            <input type="hidden" name="next_active" value={selectedUser?.active ? "false" : "true"} />
            <SubmitButton
              pendingText="Updating…"
              disabled={commandDisabled}
              className={secondaryButton}
            >
              {selectedUser ? (selectedUser.active ? "Deactivate" : "Activate") : "Activate / deactivate"}
            </SubmitButton>
          </form>
          <button
            type="button"
            disabled={commandDisabled}
            title={selectedIsSelf ? "You cannot change your own credentials here." : undefined}
            onClick={() => setCredentialsUserId(selectedUser?.id ?? null)}
            className={secondaryButton}
          >
            {LIST.commands[1].label}
          </button>
          {selectedUser && (
            <span className="self-center text-sm font-semibold text-green-800 dark:text-green-300">
              {selectedUser.name}
            </span>
          )}
        </ListCommandToolbar>

        <ListCreatePanel open={adding} title="Add user">
          <form
            ref={createFormRef}
            action={mutationAction(createUser, { onSuccess: closeCreate })}
            className="grid gap-4"
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Name *"><input name="name" required className={inputClass} /></Field>
              <Field label="Email *"><input name="email" type="email" required className={inputClass} /></Field>
              <Field label="Phone"><input name="phone" inputMode="tel" className={inputClass} /></Field>
              <Field label="Role *">
                <select name="role" required defaultValue="" className={inputClass}>
                  <option value="" disabled>Select role</option>
                  <option value="owner">Owner — full access and user management</option>
                  <option value="manager">Manager — management access</option>
                  <option value="supervisor">Supervisor — operations access</option>
                  <option value="accountant">Accountant — financial access</option>
                  <option value="collector">Collector — weighing entry</option>
                </select>
              </Field>
              <Field label="Username (optional)">
                <input name="username" autoComplete="off" placeholder="e.g. john.silva" className={inputClass} />
              </Field>
              <Field label="Password (optional)">
                <input name="password" type="password" autoComplete="new-password" className={inputClass} />
              </Field>
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Username and password must be provided together. Leave both blank to use one-time email codes only.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={closeCreate} className={secondaryButton}>Cancel</button>
              <SubmitButton pendingText="Adding…" className="min-h-10 rounded-full bg-green-700 px-5 text-sm font-semibold text-white hover:bg-green-800 dark:bg-green-500 dark:text-green-950">
                Add user
              </SubmitButton>
            </div>
          </form>
        </ListCreatePanel>

        <ListCreatePanel open={Boolean(credentialsUser)} title={`Set credentials${credentialsUser ? ` for ${credentialsUser.name}` : ""}`}>
          {credentialsUser && (
            <form
              key={credentialsUser.id}
              action={mutationAction(resetUserPassword, {
                onSuccess: () => {
                  setCredentialsUserId(null);
                  selection.clear();
                },
              })}
              className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
            >
              <input type="hidden" name="user_id" value={credentialsUser.id} />
              <Field label="Username">
                <input name="username" defaultValue={credentialsUser.username ?? ""} autoComplete="off" className={inputClass} />
              </Field>
              <Field label="New password">
                <input name="password" type="password" autoComplete="new-password" className={inputClass} />
              </Field>
              <div className="flex gap-2">
                <button type="button" onClick={() => setCredentialsUserId(null)} className={secondaryButton}>Cancel</button>
                <SubmitButton pendingText="Saving…" className="min-h-10 rounded-full bg-green-700 px-5 text-sm font-semibold text-white hover:bg-green-800 dark:bg-green-500 dark:text-green-950">
                  Save
                </SubmitButton>
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400 sm:col-span-3">
                Provide both fields to set password login, or leave both blank to remove the username.
              </p>
            </form>
          )}
        </ListCreatePanel>

        <ListSearchPanel columns={LIST.columns} controls={controls} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
                {LIST.columns.map((column) => (
                  <th key={column.key} className="px-4 py-3">
                    {column.sortable ? <SortButton col={column} controls={controls} /> : column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {controls.rows.map((user) => {
                const isSelf = user.id === currentUserId;
                return (
                  <tr
                    key={user.id}
                    {...selection.rowProps(user.id, changingRecord)}
                    className={`cursor-pointer border-b border-stone-100 last:border-0 dark:border-stone-800 ${selection.isSelected(user.id) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}
                  >
                    <td className="px-4 py-3 font-medium text-stone-900 dark:text-stone-100">
                      {user.name}
                      {isSelf && <span className="ml-2 text-xs font-normal text-stone-400">(you)</span>}
                    </td>
                    <td className="px-4 py-3 text-stone-600 dark:text-stone-400">{user.email}</td>
                    <td className="px-4 py-3 text-stone-500 dark:text-stone-400">
                      {user.username ?? <span className="italic text-stone-300 dark:text-stone-600">none</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${roleBadge[user.role] ?? "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300"}`}>
                        {ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] ?? user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${user.active ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-400" : "bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400"}`}>
                        {user.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {controls.rows.length === 0 && rows.length > 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">No users match the current search.</td></tr>
              )}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">No users yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </ListSurface>

      <ConfirmationDialog
        open={confirmingRemove && Boolean(selectedUser)}
        title={`Remove ${selectedUser?.name ?? "this user"}?`}
        description="They will no longer be able to sign in. Historical records are kept, and any linked collector record is unlinked."
        confirmLabel="Remove user"
        destructive
        busy={removing}
        onCancel={() => setConfirmingRemove(false)}
        onConfirm={() => { void handleRemove(); }}
      />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-stone-700 dark:text-stone-300">
      {label}
      {children}
    </label>
  );
}
