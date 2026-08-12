// Single source of truth for how raw lot/sale states collapse into the small set
// of user-facing status chips. Previously duplicated in page.tsx and
// dispatched-lots-table.tsx; keep one map so labels/colours never drift apart.
export type StateBucket = { label: string; style: string };

const PENDING = "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400";
const ACTIVE = "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-400";
const SOLD = "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-400";
const ISSUE = "bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-400";

export const STATE_BUCKET: Record<string, StateBucket> = {
  invoiced:   { label: "Invoiced", style: PENDING },
  dispatched: { label: "Pending", style: PENDING },
  pending:    { label: "Pending", style: PENDING },
  draft:      { label: "Draft", style: PENDING },
  grn:        { label: "GRN", style: ACTIVE },
  acknowledged: { label: "Acknowledged", style: ACTIVE },
  catalogued: { label: "Catalogued",  style: ACTIVE },
  valued:     { label: "Valued",  style: ACTIVE },
  sold:       { label: "Sold",    style: SOLD },
  settled:    { label: "Sold",    style: SOLD },
  broker_statement: { label: "Broker statement", style: SOLD },
  shutout:    { label: "Shutout",   style: ISSUE },
  "not-valued": { label: "Not Valued", style: ISSUE },
  withdrawn:  { label: "Withdrawn",   style: ISSUE },
  "re-print": { label: "Re-print",   style: ISSUE },
  missing:    { label: "Missing",   style: ISSUE },
};

// Fallback for an unrecognised state — shows the raw value in the neutral style.
export function stateBucket(state: string | null | undefined): StateBucket {
  return STATE_BUCKET[state ?? ""] ?? { label: state ?? "—", style: PENDING };
}

/**
 * Search options for a column whose accessor returns a bucket LABEL.
 *
 * Derived from the same map the column renders through, so the search offers
 * exactly the labels a row can actually show and cannot drift from them. Pass
 * the raw states the list can hold; duplicates collapse (several raw states
 * share one label) and order is preserved.
 *
 * Declaring these matters: without them a select column can only offer values
 * found in the rows already loaded, so a state nobody happens to be in right
 * now becomes unsearchable.
 */
export function stateBucketOptions(states: readonly (string | null)[]): { value: string; label: string }[] {
  const labels = states.map((state) => stateBucket(state).label);
  return [...new Set(labels)].map((label) => ({ value: label, label }));
}

/**
 * A Broker Invoice that has not been confirmed yet. Confirming it moves the
 * status to "invoiced" and it never returns here, so this is exactly the
 * window in which the invoice may still be edited or deleted by a non-owner.
 * "dispatched" is the legacy name for an open draft and must stay included.
 */
const OPEN_DRAFT_STATUSES = ["draft", "dispatched"];

/**
 * Every status a Broker Invoice can hold. Lives here beside the bucket map so
 * a list can declare its full search options without re-deriving them.
 */
export const BROKER_INVOICE_STATUSES = ["draft", "dispatched", "invoiced", "grn", "catalogued"] as const;

export function isOpenDraft(status: string | null | undefined): boolean {
  return OPEN_DRAFT_STATUSES.includes(status ?? "");
}
