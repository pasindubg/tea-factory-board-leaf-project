// Single source of truth for how raw lot/sale states collapse into the small set
// of user-facing status chips. Previously duplicated in page.tsx and
// dispatched-lots-table.tsx; keep one map so labels/colours never drift apart.
export type StateBucket = { label: string; style: string };

const PENDING = "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400";
const ACTIVE = "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-400";
const SOLD = "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-400";
const ISSUE = "bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-400";

export const STATE_BUCKET: Record<string, StateBucket> = {
  invoiced:   { label: "Pending", style: PENDING },
  dispatched: { label: "Pending", style: PENDING },
  pending:    { label: "Pending", style: PENDING },
  catalogued: { label: "Active",  style: ACTIVE },
  valued:     { label: "Active",  style: ACTIVE },
  sold:       { label: "Sold",    style: SOLD },
  settled:    { label: "Sold",    style: SOLD },
  shutout:    { label: "Issue",   style: ISSUE },
  withdrawn:  { label: "Issue",   style: ISSUE },
  "re-print": { label: "Issue",   style: ISSUE },
};

// Fallback for an unrecognised state — shows the raw value in the neutral style.
export function stateBucket(state: string | null | undefined): StateBucket {
  return STATE_BUCKET[state ?? ""] ?? { label: state ?? "—", style: PENDING };
}
