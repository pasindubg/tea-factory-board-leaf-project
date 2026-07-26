"use client";

import { FileText, Upload } from "lucide-react";
import { useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { AppButton } from "@/components/ui/button";
import { AppDrawer } from "@/components/ui/drawer";
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
    pendingText: "Reading…",
    action: ingestAcknowledgement,
  },
  {
    key: "valuation",
    title: "Valuation",
    accept: "application/pdf",
    pendingText: "Reading…",
    action: ingestValuation,
  },
  {
    key: "contract",
    title: "Sellers contract",
    accept: "application/pdf",
    pendingText: "Reading…",
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
      <AppButton
        type="button"
        size="sm"
        onClick={() => setOpen(true)}
        className="rounded-full"
      >
        <FileText aria-hidden="true" className="h-4 w-4" />
        Document reconciliation
      </AppButton>

      <AppDrawer open={open} title="Document reconciliation" description={`Sale ${saleNo} · ${groups.length} broker${groups.length === 1 ? "" : "s"}`} onClose={() => setOpen(false)}>
              <div className="grid gap-4">
                {groups.map((group) => (
                  <div key={group.saleId} className="rounded-2xl border border-stone-200 bg-stone-50/60 p-4 dark:border-stone-700 dark:bg-stone-900/60">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">{group.broker}</p>
                        <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                          {group.dispatchNos.join(", ")} · {group.lotCount} lot{group.lotCount === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3">
                      {DOCS.map((doc) => {
                        const inputId = `${doc.key}-${group.saleId}`;
                        return (
                          <form key={doc.key} action={doc.action.bind(null, group.saleId)} className="flex items-center gap-3">
                            <input id={inputId} type="file" name="file" accept={doc.accept} required className="peer sr-only" />
                            <label
                              htmlFor={inputId}
                              className="inline-flex h-10 min-w-40 cursor-pointer items-center gap-2 rounded-full border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-green-50 hover:text-green-800 hover:border-green-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-green-950 dark:hover:text-green-300 dark:hover:border-green-700"
                            >
                              <Upload aria-hidden="true" className="h-4 w-4" />
                              {doc.title}
                            </label>
                            <SubmitButton
                              pendingText={doc.pendingText}
                              className="inline-flex h-10 items-center rounded-full bg-green-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-green-800 disabled:opacity-60 dark:bg-green-600 dark:hover:bg-green-700"
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
      </AppDrawer>
    </>
  );
}
