"use client";

import { useRef } from "react";
import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import { SubmitButton } from "@/components/submit-button";
import type { SentMessageListRow } from "@/lib/list-resources";
import { sendMessage } from "./actions";

type SupplierOption = { id: string; name: string };

const COLUMNS: EntityListColumn<SentMessageListRow>[] = [
  { key: "title", label: "Title", accessor: (row) => row.title, sortable: true, filter: "text", render: (row) => <span className="font-medium text-stone-900 dark:text-stone-100">{row.title}</span> },
  { key: "recipient", label: "Recipient", accessor: (row) => row.recipient, sortable: true, filter: "select", render: (row) => <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-300">{row.recipient}</span> },
  { key: "body", label: "Message", accessor: (row) => row.body, sortable: true, filter: "text", lov: false, cellClassName: "max-w-xl whitespace-pre-wrap text-stone-600 dark:text-stone-300" },
  { key: "sentAt", label: "Sent", accessor: (row) => row.sentAt, sortable: true, searchInput: "date", cellClassName: "whitespace-nowrap text-xs text-stone-500 dark:text-stone-400", render: (row) => new Date(row.sentAt).toLocaleString() },
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
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <EntityList
      resource={{ key: "communications.sent-messages" }}
      initialRows={initialRows}
      definition={LIST}
      getId={(row) => row.id}
      rowLabel={(row) => row.title}
      title="Recent messages"
      description="Messages already delivered to the supplier field app."
      emptyMessage="No messages sent yet."
      create={{
        action: sendMessage,
        label: "New message",
        panelTitle: "Compose message",
        disabledReason: "Finish composing the current message first.",
        onSuccess: () => formRef.current?.reset(),
        render: ({ action, close }) => <form
          ref={formRef}
          action={action}
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
                close();
              }}
              className="min-h-10 rounded-full border border-stone-300 px-4 text-sm font-semibold text-stone-700 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              Cancel
            </button>
            <SubmitButton pendingText="Sending…" className="min-h-10 rounded-full bg-green-700 px-5 text-sm font-semibold text-white hover:bg-green-800 dark:bg-green-500 dark:text-green-950 dark:hover:bg-green-400">
              Send message
            </SubmitButton>
          </div>
        </form>,
      }}
    />
  );
}
