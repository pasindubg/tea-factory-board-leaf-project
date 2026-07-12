"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { ingestAcknowledgement, ingestContract, ingestValuation } from "../../actions";

export type SalesReconciliationGroup = {
  saleId: string;
  broker: string;
  dispatchNos: string[];
  lotCount: number;
};

const DOCS = [
  {
    key: "ack",
    title: "Acknowledgement",
    accept: "application/pdf",
    pendingText: "Reading...",
    action: ingestAcknowledgement,
  },
  {
    key: "valuation",
    title: "Valuation",
    accept: "application/pdf",
    pendingText: "Reading...",
    action: ingestValuation,
  },
  {
    key: "contract",
    title: "Sellers contract",
    accept: "application/pdf",
    pendingText: "Reading...",
    action: ingestContract,
  },
] as const;

export function SalesReconciliationAssistant({
  saleNo,
  groups,
}: {
  saleNo: string;
  groups: SalesReconciliationGroup[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
        >
          <DocumentIcon />
          Document reconciliation
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close document reconciliation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 cursor-default bg-black/30"
          />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col border-l border-stone-200 bg-white shadow-2xl dark:border-stone-700 dark:bg-stone-950">
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4 dark:border-stone-800">
              <div>
                <h3 className="text-base font-semibold text-stone-800 dark:text-stone-100">Document reconciliation</h3>
                <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Sale {saleNo}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-stone-200 text-stone-500 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="grid gap-3">
                {groups.map((group) => (
                  <div key={group.saleId} className="rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-900">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">{group.broker}</p>
                        <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                          {group.dispatchNos.join(", ")} · {group.lotCount} lot{group.lotCount === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {DOCS.map((doc) => {
                        const inputId = `${doc.key}-${group.saleId}`;
                        return (
                          <form key={doc.key} action={doc.action.bind(null, group.saleId)} className="flex items-center gap-2">
                            <input id={inputId} type="file" name="file" accept={doc.accept} required className="peer sr-only" />
                            <label
                              htmlFor={inputId}
                              className="inline-flex h-9 min-w-40 cursor-pointer items-center rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
                            >
                              {doc.title}
                            </label>
                            <SubmitButton
                              pendingText={doc.pendingText}
                              className="inline-flex h-9 items-center rounded-md bg-green-700 px-3 text-sm font-semibold text-white hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700"
                            >
                              Upload
                            </SubmitButton>
                          </form>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function DocumentIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Zm6.75 1.5v3.25h3.25L11.25 3.5ZM6.75 10a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 3a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z" clipRule="evenodd" />
    </svg>
  );
}
