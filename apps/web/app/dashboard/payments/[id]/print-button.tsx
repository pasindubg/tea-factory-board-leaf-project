"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-md border border-stone-300 px-4 py-2 text-sm hover:bg-stone-100 print:hidden"
    >
      Print
    </button>
  );
}
