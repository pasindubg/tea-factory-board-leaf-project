"use client";

import Link from "next/link";
import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import { SubmitButton } from "@/components/submit-button";
import type { AccessRoleListRow } from "@/lib/list-resources";
import { CUSTOMIZABLE_BASE_ROLES, ROLE_LABELS } from "@/lib/roles";
import { createAccessRole, removeAccessRole, renameAccessRole } from "./actions";

const input = "w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-green-600 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100";
const secondary = "min-h-10 rounded-full border border-stone-300 px-4 text-sm font-semibold text-stone-700 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800";

const columns: EntityListColumn<AccessRoleListRow>[] = [
  {
    key: "name",
    label: "Role",
    accessor: (row) => row.name,
    sortable: true,
    filter: "text",
    lov: false,
    cellClassName: "font-medium text-stone-900 dark:text-stone-100",
    render: (row) => (
      <div>
        <Link href={`/dashboard/user-handling/roles/${row.id}`} className="text-green-800 hover:underline dark:text-green-300">{row.name}</Link>
        {row.systemRole && <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-300">built-in</span>}
      </div>
    ),
    edit: (row, { formId }) => <input form={formId} name="name" defaultValue={row.name} disabled={row.systemRole} className={input} />,
  },
  {
    key: "baseRole",
    label: "Base security level",
    accessor: (row) => ROLE_LABELS[row.baseRole as keyof typeof ROLE_LABELS] ?? row.baseRole,
    sortable: true,
    filter: "select",
    filterOptions: Object.entries(ROLE_LABELS).map(([value, label]) => ({ value: label, label })),
    render: (row) => <span className="capitalize text-stone-600 dark:text-stone-400">{ROLE_LABELS[row.baseRole as keyof typeof ROLE_LABELS] ?? row.baseRole}</span>,
  },
  {
    key: "access",
    label: "Access",
    accessor: () => "Configure",
    sortable: false,
    lov: false,
    render: (row) => <Link href={`/dashboard/user-handling/roles/${row.id}`} className="font-medium text-green-700 hover:underline dark:text-green-400">Configure pages →</Link>,
  },
];

const definition = { columns, selectionMode: "single", add: true, edit: true, delete: true } satisfies ListDefinition<AccessRoleListRow>;

export function RolesTable({ initialRows }: { initialRows: AccessRoleListRow[] }) {
  return (
    <EntityList
      resource={{ key: "users.roles" }}
      initialRows={initialRows}
      definition={definition}
      getId={(row) => row.id}
      rowLabel={(row) => row.name}
      title="Factory roles"
      description="Built-in roles are retained and configurable. New roles inherit a safe base security level, then you choose their pages and actions."
      emptyMessage="No roles have been created."
      create={{
        action: createAccessRole,
        label: "New role",
        panelTitle: "Create role",
        render: ({ action, close }) => (
          <form action={action} className="grid gap-4">
            <label className="grid gap-1.5 text-sm font-medium text-stone-700 dark:text-stone-300">Role name
              <input name="name" required placeholder="e.g. Dispatch clerk" className={input} />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-stone-700 dark:text-stone-300">Base security level
              <select name="base_role" required defaultValue="" className={input}>
                <option value="" disabled>Select the maximum access level</option>
                {CUSTOMIZABLE_BASE_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
              </select>
            </label>
            <p className="text-xs text-stone-500 dark:text-stone-400">The base level is a safety ceiling set by the database. You will choose the actual pages and CRUD actions after creating the role.</p>
            <div className="flex justify-end gap-2"><button type="button" onClick={close} className={secondary}>Cancel</button><SubmitButton pendingText="Creating…" className="min-h-10 rounded-full bg-green-700 px-5 text-sm font-semibold text-white hover:bg-green-800 dark:bg-green-500 dark:text-green-950">Create role</SubmitButton></div>
          </form>
        ),
      }}
      edit={{
        action: (row, formData) => renameAccessRole(row.id, formData),
        canEdit: true,
        disabledReason: "Built-in role names are fixed.",
        saveLabel: "Save role",
      }}
      canDelete
      deleteAction={{
        action: async (_ids, rows) => {
          const formData = new FormData();
          formData.set("role_id", rows[0]?.id ?? "");
          return removeAccessRole(formData);
        },
        disabled: (rows) => rows.length !== 1 || rows[0].systemRole,
        disabledReason: (rows) => rows[0]?.systemRole ? "Built-in roles are retained for existing users." : undefined,
        title: () => "Remove this role?",
        description: () => "Its page permissions will be removed. Assigned users keep their base security role.",
        confirmLabel: "Remove role",
      }}
    />
  );
}
