"use client";

import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import type { StaffDirectoryListRow } from "@/lib/list-resources";
import { ROLE_LABELS, type Role } from "@/lib/roles";

const EMPLOYMENT_LABELS: Record<string, string> = {
  permanent: "Permanent",
  contract: "Contract",
  temporary: "Temporary",
  part_time: "Part-time",
  seasonal: "Seasonal",
};

const COLUMNS: EntityListColumn<StaffDirectoryListRow>[] = [
  {
    key: "fullName",
    label: "Name",
    accessor: (row) => row.fullName,
    sortable: true,
    filter: "text",
    lov: false,
    cellClassName: "font-medium text-stone-900 dark:text-stone-100",
  },
  {
    key: "role",
    label: "Access level",
    accessor: (row) => row.role,
    sortable: true,
    filter: "select",
    filterOptions: Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label })),
    render: (row) => ROLE_LABELS[row.role as Role] ?? row.role,
  },
  {
    key: "jobTitle",
    label: "Job title",
    accessor: (row) => row.jobTitle,
    sortable: true,
    filter: "text",
    lov: false,
  },
  {
    key: "department",
    label: "Department",
    accessor: (row) => row.department,
    sortable: true,
    filter: "text",
    lov: false,
  },
  {
    key: "employmentType",
    label: "Employment",
    accessor: (row) => row.employmentType,
    sortable: true,
    filter: "select",
    render: (row) => row.employmentType ? EMPLOYMENT_LABELS[row.employmentType] ?? row.employmentType : "—",
  },
  {
    key: "phone",
    label: "Phone",
    accessor: (row) => row.phone,
    sortable: true,
    filter: "text",
    lov: false,
  },
];

const DIRECTORY_DEFINITION = {
  columns: COLUMNS,
  selectionMode: "single",
  add: false,
  edit: false,
  delete: false,
} satisfies ListDefinition<StaffDirectoryListRow>;

export function StaffDirectory({ initialRows }: { initialRows: StaffDirectoryListRow[] }) {
  return (
    <EntityList
      resource={{ key: "users.staff-directory" }}
      initialRows={initialRows}
      definition={DIRECTORY_DEFINITION}
      getId={(row) => row.id}
      rowLabel={(row) => row.fullName}
      emptyMessage="No one has shared a staff profile yet."
      filteredEmptyMessage="No shared profiles match these filters."
    />
  );
}
