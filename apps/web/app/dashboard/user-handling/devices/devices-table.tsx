"use client";

import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import type { UserDeviceListRow } from "@/lib/list-resources";
import { revokeSelectedDevices } from "./actions";

export type DeviceRow = UserDeviceListRow;

const COLUMNS: EntityListColumn<DeviceRow>[] = [
  {
    key: "userName",
    label: "User",
    accessor: (row) => row.userName,
    sortable: true,
    filter: "text",
    lov: false,
    cellClassName: "font-medium",
  },
  {
    key: "role",
    label: "Role",
    accessor: (row) => row.role,
    sortable: true,
    filter: "text",
    lov: false,
    minWidth: 110,
  },
  {
    key: "model",
    label: "Device",
    accessor: (row) => row.model ?? null,
    sortable: true,
    filter: "text",
    lov: false,
    render: (row) => row.model ?? row.platform ?? "—",
  },
  {
    key: "appVersion",
    label: "App version",
    accessor: (row) => row.appVersion ?? null,
    sortable: true,
    filter: "text",
    lov: false,
    minWidth: 100,
    render: (row) => row.appVersion ?? "—",
  },
  {
    key: "lastSeenAt",
    label: "Last seen",
    accessor: (row) => row.lastSeenAt ?? null,
    sortable: true,
    filter: "text",
    lov: false,
    minWidth: 150,
    render: (row) => (row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString() : "—"),
  },
];

const LIST = {
  columns: COLUMNS,
  selectionMode: "multi",
  add: false,
  edit: false,
  delete: false,
} satisfies ListDefinition<DeviceRow>;

export function DevicesTable({ rows }: { rows: DeviceRow[] }) {
  return (
    <EntityList
      resource={{ key: "users.devices" }}
      initialRows={rows}
      definition={LIST}
      getId={(row) => row.id}
      rowLabel={(row) => row.userName}
      title="Bound devices"
      description="A mobile login works on one phone. Release a device to let that user sign in on a replacement."
      emptyMessage="No devices bound yet."
      commands={[
        {
          id: "revoke",
          label: "Release device",
          disabled: ({ selectedRows }) => selectedRows.length === 0,
          confirm: {
            title: "Release device",
            description: "The selected users will be signed out of that phone and may pair a new one.",
            confirmLabel: "Release",
          },
          run: ({ selectedRows }) => {
            const formData = new FormData();
            selectedRows.forEach((row) => formData.append("selected_ids", row.id));
            return revokeSelectedDevices(formData);
          },
        },
      ]}
    />
  );
}
