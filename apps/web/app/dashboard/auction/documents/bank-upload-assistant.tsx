"use client";

import { FileText, Upload } from "lucide-react";
import { useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { AppButton } from "@/components/ui/button";
import { AppDrawer } from "@/components/ui/drawer";
import { ingestBankAuto } from "../_actions/report-analyser";

export function BankUploadAssistant() {
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
        Bank statement
      </AppButton>

      <AppDrawer
        open={open}
        title="Upload bank statement"
        description="Reconcile (④) settlements against the credits that actually arrived."
        onClose={() => setOpen(false)}
      >
        <form action={ingestBankAuto} className="flex items-center gap-3">
          <input id="bank-csv-file" type="file" name="file" accept=".csv,text/csv" required className="peer sr-only" />
          <label
            htmlFor="bank-csv-file"
            className="inline-flex h-10 min-w-40 cursor-pointer items-center gap-2 rounded-full border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-green-50 hover:text-green-800 hover:border-green-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-green-950 dark:hover:text-green-300 dark:hover:border-green-700"
          >
            <Upload aria-hidden="true" className="h-4 w-4" />
            Bank statement (CSV)
          </label>
          <SubmitButton
            pendingText="Reading…"
            variant="primary"
            className="h-10 rounded-full px-5 text-sm"
          >
            Upload
          </SubmitButton>
        </form>
      </AppDrawer>
    </>
  );
}
