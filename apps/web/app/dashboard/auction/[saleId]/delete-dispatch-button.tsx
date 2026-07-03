"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteSale } from "../actions";
import { AUC } from "../_actions/_shared";

export function DeleteDispatchButton({ saleId }: { saleId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this dispatch and all its lots? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await deleteSale(saleId);
      router.replace(AUC);
    } catch {
      setDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 dark:border-stone-600 px-3 py-1.5 text-sm text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-50"
    >
      {deleting && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-stone-400 border-t-transparent" />}
      {deleting ? "Deleting…" : "Delete dispatch"}
    </button>
  );
}
