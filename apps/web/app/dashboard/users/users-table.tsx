"use client";

import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import { SubmitButton } from "@/components/submit-button";
import type { AccessRoleListRow, UserAccountListRow } from "@/lib/list-resources";
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

const inputClass = "w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-green-600 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100";
const secondaryButton = "min-h-10 rounded-full border border-stone-300 px-4 text-sm font-semibold text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800";

function columns(currentUserId: string, roles: AccessRoleListRow[]): EntityListColumn<UserAccountListRow>[] {
  return [
    {
      key: "name",
      label: "Name",
      accessor: (row) => row.name,
      sortable: true,
      filter: "text",
      lov: false,
      cellClassName: "font-medium text-stone-900 dark:text-stone-100",
      render: (row) => <>{row.name}{row.id === currentUserId && <span className="ml-2 text-xs font-normal text-stone-400">(you)</span>}</>,
    },
    { key: "email", label: "Email", accessor: (row) => row.email, sortable: true, filter: "text", lov: false, cellClassName: "text-stone-600 dark:text-stone-400" },
    {
      key: "username",
      label: "Username",
      accessor: (row) => row.username,
      sortable: true,
      filter: "text",
      lov: false,
      cellClassName: "text-stone-500 dark:text-stone-400",
      render: (row) => row.username ?? <span className="italic text-stone-300 dark:text-stone-600">none</span>,
    },
    {
      key: "role",
      label: "Role",
      accessor: (row) => row.role,
      sortable: true,
      filter: "select",
      filterOptions: roles.map((role) => ({ value: role.name, label: role.name })),
      render: (row) => (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${roleBadge[row.role] ?? "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300"}`}>
          {row.role}
        </span>
      ),
    },
    {
      key: "active",
      label: "Status",
      accessor: (row) => row.active ? "active" : "inactive",
      sortable: true,
      filter: "select",
      filterOptions: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }],
      render: (row) => (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${row.active ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-400" : "bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400"}`}>
          {row.active ? "Active" : "Inactive"}
        </span>
      ),
    },
  ];
}

export function UsersTable({
  initialRows,
  currentUserId,
  roles,
}: {
  initialRows: UserAccountListRow[];
  currentUserId: string;
  roles: AccessRoleListRow[];
}) {
  const definition = {
    columns: columns(currentUserId, roles),
    selectionMode: "single",
    add: true,
    edit: false,
    delete: true,
  } satisfies ListDefinition<UserAccountListRow>;

  return (
    <EntityList
      resource={{ key: "users.accounts" }}
      initialRows={initialRows}
      definition={definition}
      getId={(row) => row.id}
      rowLabel={(row) => row.name}
      title="User accounts"
      description="Factory users, login identifiers, roles, and account status."
      emptyMessage="No users yet."
      create={{
        action: createUser,
        label: "New user",
        panelTitle: "Add user",
        disabledReason: "Finish the current user change first.",
        render: ({ action, close }) => (
          <form action={action} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Name *"><input name="name" required className={inputClass} /></Field>
              <Field label="Email *"><input name="email" type="email" required className={inputClass} /></Field>
              <Field label="Phone"><input name="phone" inputMode="tel" className={inputClass} /></Field>
              <Field label="Role *">
                <select name="access_role_id" required defaultValue="" className={inputClass}>
                  <option value="" disabled>Select role</option>
                  {roles.filter((role) => role.active).map((role) => (
                    <option key={role.id} value={role.id}>{role.name} — {ROLE_LABELS[role.baseRole as keyof typeof ROLE_LABELS] ?? role.baseRole} base</option>
                  ))}
                </select>
              </Field>
              <Field label="Username (optional)"><input name="username" autoComplete="off" placeholder="e.g. john.silva" className={inputClass} /></Field>
              <Field label="Password (optional)"><input name="password" type="password" autoComplete="new-password" className={inputClass} /></Field>
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400">Username and password must be provided together. Leave both blank to use one-time email codes only.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={close} className={secondaryButton}>Cancel</button>
              <SubmitButton pendingText="Adding…" className="min-h-10 rounded-full bg-green-700 px-5 text-sm font-semibold text-white hover:bg-green-800 dark:bg-green-500 dark:text-green-950">Add user</SubmitButton>
            </div>
          </form>
        ),
      }}
      commands={[
        {
          id: "active",
          label: ({ selectedRows }) => selectedRows[0]?.active ? "Deactivate" : "Activate",
          disabled: ({ selectedRows }) => selectedRows.length !== 1 || selectedRows[0].id === currentUserId,
          disabledReason: ({ selectedRows }) => selectedRows[0]?.id === currentUserId ? "You cannot change your own account here." : undefined,
          run: ({ selectedRows }) => changeUserActive(selectedRows[0]),
        },
        {
          id: "credentials",
          label: "Set credentials",
          disabled: ({ selectedRows }) => selectedRows.length !== 1 || selectedRows[0].id === currentUserId,
          disabledReason: ({ selectedRows }) => selectedRows[0]?.id === currentUserId ? "You cannot change your own credentials here." : undefined,
          panel: {
            title: ({ selectedRows }) => `Set credentials for ${selectedRows[0]?.name ?? "user"}`,
            action: (formData, { selectedRows }) => {
              formData.set("user_id", selectedRows[0].id);
              return resetUserPassword(formData);
            },
            render: ({ action, close, command }) => (
              <form action={action} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                <Field label="Username"><input name="username" defaultValue={command.selectedRows[0]?.username ?? ""} autoComplete="off" className={inputClass} /></Field>
                <Field label="New password"><input name="password" type="password" autoComplete="new-password" className={inputClass} /></Field>
                <div className="flex gap-2">
                  <button type="button" onClick={close} className={secondaryButton}>Cancel</button>
                  <SubmitButton pendingText="Saving…" className="min-h-10 rounded-full bg-green-700 px-5 text-sm font-semibold text-white hover:bg-green-800 dark:bg-green-500 dark:text-green-950">Save</SubmitButton>
                </div>
                <p className="text-xs text-stone-500 dark:text-stone-400 sm:col-span-3">Provide both fields to set password login, or leave both blank to remove the username.</p>
              </form>
            ),
          },
        },
      ]}
      deleteAction={{
        action: async (_ids, selectedRows) => removeUserAction(selectedRows[0]),
        disabled: (selectedRows) => selectedRows.length !== 1 || selectedRows[0].id === currentUserId,
        disabledReason: (selectedRows) => selectedRows[0]?.id === currentUserId ? "You cannot remove your own account." : undefined,
        title: () => "Remove user?",
        description: () => "They will no longer be able to sign in. Historical records are kept, and any linked collector record is unlinked.",
        confirmLabel: "Remove user",
      }}
      canDelete
    />
  );
}

function changeUserActive(user: UserAccountListRow) {
  const formData = new FormData();
  formData.set("user_id", user.id);
  formData.set("next_active", String(!user.active));
  return setUserActive(formData);
}

function removeUserAction(user: UserAccountListRow) {
  const formData = new FormData();
  formData.set("user_id", user.id);
  return removeUser(formData);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-stone-700 dark:text-stone-300">
      {label}
      {children}
    </label>
  );
}
