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
      description="Drivers and field officers can sign in on one phone at a time. Release a device if the user cannot sign out from that phone."
      emptyMessage="No devices bound yet."
      commands={[
        {
          id: "revoke",
          label: "Release device",
          disabled: ({ selectedRows }) => selectedRows.length === 0,
          confirm: {
            title: "Release device",
            description: "This ends access from the selected phones so the users can sign in again.",
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
