"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteSale } from "../actions";
import { AUC } from "../_actions/_shared";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { showAppToast } from "@/components/action-feedback";

export function DeleteDispatchButton({ saleId }: { saleId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function deleteDispatch() {
    setDeleting(true);
    try {
      await deleteSale(saleId);
      showAppToast("Broker invoice deleted.");
      router.replace(AUC);
    } catch {
      setDeleting(false);
      setConfirming(false);
      showAppToast("Could not delete the broker invoice. Please try again.", "error");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={deleting}
        className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 dark:border-stone-600 px-3 py-1.5 text-sm text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-50"
      >
        {deleting && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-stone-400 border-t-transparent" />}
        {deleting ? "Deleting…" : "Delete broker invoice"}
      </button>
      <ConfirmationDialog
        open={confirming}
        title="Delete broker invoice?"
        description="This will permanently remove the broker invoice and all of its lot invoices. This cannot be undone."
        confirmLabel="Delete broker invoice"
        destructive
        busy={deleting}
        onCancel={() => setConfirming(false)}
        onConfirm={deleteDispatch}
      />
    </>
  );
}
