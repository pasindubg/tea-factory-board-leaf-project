"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteSale } from "../actions";

export function DeleteDispatchButton({ saleId }: { saleId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this dispatch and all its lots? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await deleteSale(saleId);
    } catch {
      setDeleting(false);
    }
    router.refresh();
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="rounded-md border border-stone-300 dark:border-stone-600 px-3 py-1.5 text-sm text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-50"
    >
      {deleting ? "Deleting…" : "Delete dispatch"}
    </button>
  );
}
