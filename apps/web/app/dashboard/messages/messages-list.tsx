"use client";

import { useRef, useState } from "react";
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
import type { SentMessageListRow } from "@/lib/list-resources";
import { sendMessage } from "./actions";

type SupplierOption = { id: string; name: string };

const COLUMNS: ColumnDef<SentMessageListRow>[] = [
  { key: "title", label: "Title", accessor: (row) => row.title, sortable: true, filter: "text" },
  { key: "recipient", label: "Recipient", accessor: (row) => row.recipient, sortable: true, filter: "select" },
  { key: "body", label: "Message", accessor: (row) => row.body, sortable: true, filter: "text", lov: false },
  { key: "sentAt", label: "Sent", accessor: (row) => row.sentAt, sortable: true, searchInput: "date" },
];

const LIST: ListDefinition<SentMessageListRow> = {
  columns: COLUMNS,
  selectionMode: "single",
  add: true,
  edit: false,
  delete: false,
};

const fieldClass = "w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-green-600 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100";

export function MessagesList({
  initialRows,
  suppliers,
}: {
  initialRows: SentMessageListRow[];
  suppliers: SupplierOption[];
}) {
  const [adding, setAdding] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const { rows, refreshing, mutationAction } = useFrameworkListData({
    initialRows,
    resource: { key: "communications.sent-messages" },
  });
  const controls = useListControls(rows, LIST.columns);
  const selection = useListSelection(rows, {
    mode: LIST.selectionMode ?? "single",
    getId: (row) => row.id,
  });

  return (
    <ListSurface
      title="Recent messages"
      description="Messages already delivered to the supplier field app."
      onCreate={() => setAdding(true)}
      canCreate={!adding}
      createDisabledReason="Finish composing the current message first."
      createLabel="New message"
      refreshing={refreshing}
    >
      <ListCommandToolbar mode={LIST.selectionMode ?? "single"} count={selection.selectedCount} />
      <ListCreatePanel open={adding} title="Compose message">
        <form
          ref={formRef}
          action={mutationAction(sendMessage, {
            onSuccess: () => {
              formRef.current?.reset();
              setAdding(false);
            },
          })}
          className="grid gap-4"
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium text-stone-700 dark:text-stone-300">
              To
              <select name="target" defaultValue="all" className={fieldClass}>
                <option value="all">All suppliers (broadcast)</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-stone-700 dark:text-stone-300">
              Title
              <input name="title" required maxLength={120} className={fieldClass} placeholder="e.g. Factory closed on Poya day" />
            </label>
          </div>
          <label className="grid gap-1.5 text-sm font-medium text-stone-700 dark:text-stone-300">
            Message
            <textarea name="body" required rows={4} className={fieldClass} placeholder="Write your message to suppliers…" />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                formRef.current?.reset();
                setAdding(false);
              }}
              className="min-h-10 rounded-full border border-stone-300 px-4 text-sm font-semibold text-stone-700 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              Cancel
            </button>
            <SubmitButton pendingText="Sending…" className="min-h-10 rounded-full bg-green-700 px-5 text-sm font-semibold text-white hover:bg-green-800 dark:bg-green-500 dark:text-green-950 dark:hover:bg-green-400">
              Send message
            </SubmitButton>
          </div>
        </form>
      </ListCreatePanel>
      <ListSearchPanel columns={LIST.columns} controls={controls} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
              {COLUMNS.map((column) => (
                <th key={column.key} className="px-4 py-3">
                  {column.sortable ? <SortButton col={column} controls={controls} /> : column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {controls.rows.map((message) => (
              <tr
                key={message.id}
                {...selection.rowProps(message.id)}
                className={`cursor-pointer border-b border-stone-100 align-top last:border-0 dark:border-stone-800 ${selection.isSelected(message.id) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}
              >
                <td className="px-4 py-3 font-medium text-stone-900 dark:text-stone-100">{message.title}</td>
                <td className="px-4 py-3"><span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-300">{message.recipient}</span></td>
                <td className="max-w-xl whitespace-pre-wrap px-4 py-3 text-stone-600 dark:text-stone-300">{message.body}</td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-stone-500 dark:text-stone-400">{new Date(message.sentAt).toLocaleString()}</td>
              </tr>
            ))}
            {controls.rows.length === 0 && rows.length > 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">No messages match the current search.</td></tr>
            )}
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">No messages sent yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </ListSurface>
  );
}
