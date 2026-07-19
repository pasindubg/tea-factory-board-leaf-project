"use client";

import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import { SubmitButton } from "@/components/submit-button";
import { createAuctionGrade, deleteAuctionGrade, updateAuctionGrade } from "../actions";

export type GradeTableRow = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  sortOrder: number;
  aliases: string[];
};

const input = "w-full rounded border border-stone-300 px-2 py-1 text-xs dark:border-stone-600 dark:bg-stone-800";

const COLUMNS: EntityListColumn<GradeTableRow>[] = [
  {
    key: "code",
    label: "Code",
    accessor: (row) => row.code,
    sortable: true,
    filter: "text",
    cellClassName: "font-medium",
    edit: (row, { formId }) => <input form={formId} name="code" required defaultValue={row.code} className={input} />,
  },
  {
    key: "name",
    label: "Name",
    accessor: (row) => row.name,
    sortable: true,
    filter: "text",
    edit: (row, { formId }) => <input form={formId} name="name" defaultValue={row.name} className={input} />,
  },
  {
    key: "aliases",
    label: "Aliases",
    accessor: (row) => row.aliases.join(" "),
    filter: "text",
    render: (row) => <Aliases aliases={row.aliases} />,
    edit: (row, { formId }) => <input form={formId} name="aliases" defaultValue={row.aliases.join(", ")} placeholder="PEK, PEKOE" className={input} />,
  },
  {
    key: "sortOrder",
    label: "Sort",
    accessor: (row) => row.sortOrder,
    sortable: true,
    headerClassName: "text-right",
    cellClassName: "text-right tabular-nums",
    edit: (row, { formId }) => <input form={formId} name="sort_order" type="number" step="1" min="0" defaultValue={row.sortOrder} className={`${input} text-right`} />,
  },
  {
    key: "active",
    label: "State",
    accessor: (row) => row.active ? "Active" : "Inactive",
    sortable: true,
    filter: "select",
    filterOptions: [{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }],
    render: (row) => <StateBadge active={row.active} />,
    edit: (row, { formId }) => (
      <label className="inline-flex items-center gap-2 text-xs text-stone-600 dark:text-stone-300">
        <input form={formId} name="active" type="checkbox" defaultChecked={row.active} className="rounded border-stone-300" />
        Active
      </label>
    ),
  },
];

const LIST: ListDefinition<GradeTableRow> = {
  columns: COLUMNS,
  selectionMode: "single",
  add: true,
  edit: true,
  delete: true,
};

export function GradesTable({ rows, isOwner }: { rows: GradeTableRow[]; isOwner: boolean }) {
  return (
    <EntityList
      resource={{ key: "auction.grades" }}
      initialRows={rows}
      definition={LIST}
      getId={(row) => row.id}
      rowLabel={(row) => row.code}
      title="Tea grades"
      description="Factory grade set used when broker-invoice lots are entered."
      emptyMessage="No grades yet."
      canCreate={isOwner}
      create={{
        action: createAuctionGrade,
        label: "New grade",
        panelTitle: "Add tea grade",
        disabledReason: isOwner ? "Finish the current grade change first." : "Only the factory owner can add grades.",
        render: ({ action, close }) => (
          <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input name="code" required placeholder="Code, e.g. OPA" className={input} />
            <input name="name" placeholder="Display name" className={input} />
            <input name="sort_order" type="number" step="1" min="0" placeholder="Sort order" className={input} />
            <div className="flex gap-2">
              <input name="aliases" placeholder="PEK, PEKOE" className={input} />
              <button type="button" onClick={close} className="shrink-0 rounded-md border border-stone-300 px-3 py-2 text-sm font-medium dark:border-stone-600">Cancel</button>
              <SubmitButton pendingText="Adding…" className="shrink-0 rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700">Add</SubmitButton>
            </div>
          </form>
        ),
      }}
      edit={{
        canEdit: isOwner,
        action: (row, formData) => updateAuctionGrade(row.id, formData),
      }}
      canDelete={isOwner}
      deleteAction={{
        action: async (ids) => deleteAuctionGrade(ids[0]),
        title: () => "Delete grade?",
        description: (selectedRows) => `Delete ${selectedRows[0]?.code ?? "this grade"}, its aliases, and its broker threshold settings? Historical lot grade text is retained.`,
      }}
    />
  );
}

function Aliases({ aliases }: { aliases: string[] }) {
  if (aliases.length === 0) return <span className="text-stone-400 dark:text-stone-500">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {aliases.map((alias) => (
        <span key={alias} className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-300">
          {alias}
        </span>
      ))}
    </div>
  );
}

function StateBadge({ active }: { active: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400"}`}>
      {active ? "Active" : "Inactive"}
    </span>
  );
}
