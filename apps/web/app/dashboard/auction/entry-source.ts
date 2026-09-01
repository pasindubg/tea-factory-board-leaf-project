/**
 * How a Dispatch Invoice came into existence, and the one place its chip label
 * and styling are defined. Mirrors `auction_sales.entry_source`.
 *
 * `invoice` is the ordinary flow: the factory entered a lot invoice and
 * physically dispatched the tea. `reprint-register` means the invoice was
 * opened by the Re-prints page for a re-print the factory already had
 * outstanding before it started using this system — a real Dispatch Invoice
 * carrying real lots through the same broker and sale flow, but nothing was
 * dispatched for it. Without the distinction on screen an operator reads a
 * cutover entry as a physical dispatch that never happened.
 */
export const ENTRY_SOURCES = ["invoice", "reprint-register"] as const;

export type EntrySource = (typeof ENTRY_SOURCES)[number];

export type EntrySourceChip = { label: string; style: string };

const DISPATCHED = "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400";
const REGISTER = "bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-300";

const CHIP: Record<EntrySource, EntrySourceChip> = {
  invoice: { label: "Dispatched", style: DISPATCHED },
  "reprint-register": { label: "Re-print register", style: REGISTER },
};

/** Unknown or absent values read as the ordinary flow, which is what every
 * row predating the column is. */
export function entrySourceChip(value: string | null | undefined): EntrySourceChip {
  return CHIP[(value ?? "invoice") as EntrySource] ?? CHIP.invoice;
}

/** Search options for a column whose accessor returns the chip LABEL. Derived
 * from the same map the column renders through so the two cannot drift. */
export function entrySourceOptions(): { value: string; label: string }[] {
  return ENTRY_SOURCES.map((source) => ({ value: CHIP[source].label, label: CHIP[source].label }));
}
