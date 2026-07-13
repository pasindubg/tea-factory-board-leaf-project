"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-md border border-stone-300 dark:border-stone-600 px-4 py-2 text-sm hover:bg-stone-100 dark:hover:bg-stone-800 print:hidden"
    >
      Print
    </button>
  );
}
