"use client";

import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import type { SupplierListRow } from "@/lib/list-resources";
import { NewCustomerRow } from "./new-customer-row";
import { createSupplier, setSelectedSuppliersActive, updateSupplier } from "./actions";

export type SupplierRow = SupplierListRow;
export type CollectorOption = { id: string; name: string; active: boolean };

const input = "w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 focus:border-green-600 focus:outline-none dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100";

function columns(collectors: CollectorOption[]): EntityListColumn<SupplierRow>[] {
  return [
    {
      key: "customerNo",
      label: "Customer no",
      accessor: (row) => row.customerNo,
      sortable: true,
      filter: "text",
      lov: false,
      minWidth: 110,
      edit: (row, { formId }) => <input form={formId} name="customer_no" aria-label="Customer number" required inputMode="numeric" pattern="[0-9]+" defaultValue={row.customerNo} className={input} />,
    },
    {
      key: "name",
      label: "Name",
      accessor: (row) => row.name,
      sortable: true,
      filter: "text",
      lov: false,
      cellClassName: "font-medium",
      edit: (row, { formId }) => <input form={formId} name="name" aria-label="Customer name" required defaultValue={row.name} className={input} />,
    },
    {
      key: "area",
      label: "Area",
      accessor: (row) => row.area ?? null,
      sortable: true,
      filter: "select",
      render: (row) => row.area ?? "—",
      edit: (row, { formId }) => <input form={formId} name="area" aria-label="Area" defaultValue={row.area ?? ""} className={input} />,
    },
    {
      key: "lineNo",
      label: "Line",
      accessor: (row) => row.lineNo,
      sortable: true,
      filter: "text",
      lovSource: "leaf.lines",
      lovEdit: true,
      lovName: "line_id",
      lovValue: (row) => row.lineId ?? "",
      minWidth: 110,
    },
    {
      key: "address",
      label: "Address",
      accessor: (row) => row.address ?? null,
      sortable: true,
      filter: "text",
      lov: false,
      render: (row) => row.address ?? "—",
      edit: (row, { formId }) => <input form={formId} name="address" aria-label="Address" defaultValue={row.address ?? ""} className={input} />,
    },
    {
      key: "phone",
      label: "Mobile",
      accessor: (row) => row.phone,
      sortable: true,
      filter: "text",
      lov: false,
      edit: (row, { formId }) => <input form={formId} name="phone" aria-label="Mobile number" required defaultValue={row.phone} className={input} />,
    },
    {
      key: "nicNumber",
      label: "NIC",
      accessor: (row) => row.nicNumber ?? null,
      sortable: true,
      filter: "text",
      lov: false,
      render: (row) => row.nicNumber ?? "—",
      edit: (row, { formId }) => <input form={formId} name="nic_number" aria-label="NIC number" defaultValue={row.nicNumber ?? ""} className={input} />,
    },
    {
      key: "collectorName",
      label: "Collector",
      accessor: (row) => row.collectorName,
      sortable: true,
      filter: "select",
      edit: (row, { formId }) => <CollectorSelect form={formId} collectors={collectors} defaultValue={row.collectorId} />,
    },
    {
      key: "landSizeAcres",
      label: "Land (acres)",
      accessor: (row) => row.landSizeAcres != null ? Number(row.landSizeAcres) : null,
      sortable: true,
      lov: false,
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums",
      render: (row) => row.landSizeAcres ?? "—",
      edit: (row, { formId }) => <input form={formId} name="land_size_acres" aria-label="Land size in acres" type="number" step="0.01" min="0" defaultValue={row.landSizeAcres ?? ""} className={`${input} text-right`} />,
    },
    {
      key: "cultivatedAreaAcres",
      label: "Cultivated (acres)",
      accessor: (row) => row.cultivatedAreaAcres != null ? Number(row.cultivatedAreaAcres) : null,
      sortable: true,
      lov: false,
      minWidth: 120,
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums",
      render: (row) => row.cultivatedAreaAcres ?? "—",
      edit: (row, { formId }) => <input form={formId} name="cultivated_area_acres" aria-label="Cultivated area in acres" type="number" step="0.01" min="0" defaultValue={row.cultivatedAreaAcres ?? ""} className={`${input} text-right`} />,
    },
    {
      key: "latitude",
      label: "Latitude",
      accessor: (row) => Number(row.latitude),
      sortable: true,
      filter: "text",
      lov: false,
      minWidth: 110,
      cellClassName: "text-right tabular-nums",
      render: (row) => Number(row.latitude).toFixed(5),
      edit: (row, { formId }) => <input form={formId} name="latitude" aria-label="Latitude" required type="number" step="0.0000001" min="-90" max="90" defaultValue={String(row.latitude)} className={`${input} text-right`} />,
    },
    {
      key: "longitude",
      label: "Longitude",
      accessor: (row) => Number(row.longitude),
      sortable: true,
      filter: "text",
      lov: false,
      minWidth: 110,
      cellClassName: "text-right tabular-nums",
      render: (row) => Number(row.longitude).toFixed(5),
      edit: (row, { formId }) => <input form={formId} name="longitude" aria-label="Longitude" required type="number" step="0.0000001" min="-180" max="180" defaultValue={String(row.longitude)} className={`${input} text-right`} />,
    },
    {
      key: "photoUrl",
      label: "Photo",
      accessor: (row) => (row.photoUrl ? "captured" : "missing"),
      sortable: true,
      filter: "select",
      filterOptions: [{ value: "captured", label: "captured" }, { value: "missing", label: "missing" }],
      minWidth: 80,
      render: (row) => <Thumbnail url={row.photoUrl} alt={`Photo of ${row.name}`} />,
    },
    {
      key: "bankBookUrl",
      label: "Bank book",
      accessor: (row) => (row.bankBookUrl ? "captured" : "missing"),
      sortable: true,
      filter: "select",
      filterOptions: [{ value: "captured", label: "captured" }, { value: "missing", label: "missing" }],
      minWidth: 90,
      render: (row) => <Thumbnail url={row.bankBookUrl} alt={`Bank book of ${row.name}`} />,
    },
    {
      key: "bankAccountNo",
      label: "Bank account",
      accessor: (row) => row.bankAccountNo ?? null,
      sortable: true,
      filter: "text",
      lov: false,
      minWidth: 130,
      render: (row) => (row.bankAccountNo ? `${row.bankAccountNo}${row.bankName ? ` · ${row.bankName}` : ""}` : "—"),
      edit: (row, { formId }) => <input form={formId} name="bank_account_no" aria-label="Bank account number" defaultValue={row.bankAccountNo ?? ""} className={input} />,
    },
    {
      key: "active",
      label: "Status",
      accessor: (row) => row.active ? "active" : "inactive",
      sortable: true,
      filter: "select",
      filterOptions: [{ value: "active", label: "active" }, { value: "inactive", label: "inactive" }],
      render: (row) => <StatusBadge active={row.active} />,
    },
  ];
}

export function SuppliersTable({
  rows,
  collectors,
}: {
  rows: SupplierRow[];
  collectors: CollectorOption[];
}) {
  const definition = {
    columns: columns(collectors),
    selectionMode: "multi",
    add: true,
    edit: true,
    delete: false,
  } satisfies ListDefinition<SupplierRow>;

  return (
    <EntityList
      resource={{ key: "leaf.suppliers" }}
      initialRows={rows}
      definition={definition}
      getId={(row) => row.id}
      rowLabel={(row) => row.name}
      title="Customers"
      description="Green-leaf customers, the line that collects from them, and what the field app captured."
      emptyMessage="No customers yet. Use New customer to add the first one."
      create={{
        action: createSupplier,
        label: "New customer",
        disabledReason: "Finish the current customer change first.",
        renderRow: ({ formId }) => <NewCustomerRow formId={formId} collectors={collectors} />,
      }}
      createPlacement="toolbar"
      edit={{
        action: (row, formData) => updateSupplier(row.id, formData),
      }}
      commands={[
        {
          id: "open-in-map",
          label: "Open in map",
          disabled: ({ selectedRows }) => selectedRows.length !== 1,
          disabledReason: ({ selectedRows }) =>
            selectedRows.length === 0 ? "Select the customer to locate." : "Select one customer at a time.",
          onOpen: ({ selectedRows }) => {
            const [row] = selectedRows;
            if (row) window.open(googleMapsUrl(row), "_blank", "noopener,noreferrer");
          },
        },
        {
          id: "deactivate",
          label: "Deactivate",
          disabled: ({ selectedRows }) => selectedRows.length === 0 || !selectedRows.some((row) => row.active),
          run: ({ selectedRows }) => setSuppliersActive(selectedRows, false),
        },
        {
          id: "activate",
          label: "Reactivate",
          disabled: ({ selectedRows }) => selectedRows.length === 0 || !selectedRows.some((row) => !row.active),
          run: ({ selectedRows }) => setSuppliersActive(selectedRows, true),
        },
      ]}
    />
  );
}

// The pin the field officer dropped at the customer's gate, as Google Maps
// reads it.
function googleMapsUrl(row: SupplierRow) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${row.latitude},${row.longitude}`)}`;
}

function setSuppliersActive(rows: SupplierRow[], active: boolean) {
  const formData = new FormData();
  rows.forEach((row) => formData.append("selected_ids", row.id));
  return setSelectedSuppliersActive(active, formData);
}

function Thumbnail({ url, alt }: { url: string | null; alt: string }) {
  if (!url) return <span className="text-stone-400">—</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" title="Open full size">
      {/* Signed Supabase URL: short-lived and per-row, so next/image cannot cache it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} className="h-8 w-8 rounded object-cover ring-1 ring-stone-300 dark:ring-stone-600" />
    </a>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-400" : "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400"}`}>
      {active ? "active" : "inactive"}
    </span>
  );
}

function CollectorSelect({
  collectors,
  defaultValue = null,
  form,
}: {
  collectors: CollectorOption[];
  defaultValue?: string | null;
  form?: string;
}) {
  return (
    <select form={form} name="collector_id" aria-label="Collector" defaultValue={defaultValue ?? ""} className={input}>
      <option value="">— none —</option>
      {collectors.map((collector) => (
        <option key={collector.id} value={collector.id} disabled={!collector.active && collector.id !== defaultValue}>
          {collector.name}{collector.active ? "" : " (inactive)"}
        </option>
      ))}
    </select>
  );
}
