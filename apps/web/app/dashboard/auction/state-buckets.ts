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
  draft:      { label: "Draft", style: PENDING },
  grn:        { label: "GRN", style: ACTIVE },
  acknowledged: { label: "Acknowledged", style: ACTIVE },
  catalogued: { label: "Catalogued",  style: ACTIVE },
  valued:     { label: "Valued",  style: ACTIVE },
  sold:       { label: "Sold",    style: SOLD },
  broker_statement: { label: "Broker statement", style: SOLD },
};

export const FLAG_STYLE = ISSUE;

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
 * A Dispatch Invoice that has not been confirmed yet. Confirming it moves the
 * status to "invoiced" and it never returns here, so this is exactly the
 * window in which the invoice may still be edited or deleted by a non-owner.
 * "dispatched" is the legacy name for an open draft and must stay included.
 */
const OPEN_DRAFT_STATUSES = ["draft", "dispatched"];

/**
 * Every status a Dispatch Invoice can hold. Lives here beside the bucket map so
 * a list can declare its full search options without re-deriving them.
 */
export const BROKER_INVOICE_STATUSES = ["draft", "dispatched", "invoiced", "grn", "catalogued"] as const;

export function isOpenDraft(status: string | null | undefined): boolean {
  return OPEN_DRAFT_STATUSES.includes(status ?? "");
}

/**
 * Did this lot fail to sell? One rule, everywhere it is shown.
 *
 * The lot is still `valued` while a sibling on the SAME dispatch invoice reached
 * `sold`. The sibling proves that invoice's sale has been settled against a
 * contract; anything left at `valued` in it was offered and not bought.
 *
 * `anySiblingSold` is what stops a lot valued this morning reading "unsold"
 * before its sale has happened — until some lot on that invoice sells, the
 * outcome is simply not known yet.
 *
 * The stored `unsold` column still wins outright. That is not derived logic:
 * the sellers contract writes it when the document itself says NOT SOLD, which
 * also covers an invoice where nothing at all sold and no sibling exists.
 */
export function isUnsoldLot(
  lot: { state?: string | null; unsold?: boolean | null },
  anySiblingSold: boolean,
): boolean {
  if (lot.unsold) return true;
  return lot.state === "valued" && anySiblingSold;
}

/**
 * "That broker, in that sale" — the group `anySiblingSold` is asked about.
 *
 * NOT the dispatch invoice: one broker can hold several invoices in the same
 * sale, and its contract settles the whole sale at once. Keying on the invoice
 * left a valued lot reading "sold: No" while its own broker had plainly sold
 * other lots in the same sale, on a sibling invoice.
 *
 * Scoped to the sale as well, because a broker sells in every sale — without
 * it, one sale's contract would mark every valued lot that broker ever held as
 * unsold.
 */
export function brokerSaleKey(brokerId: string | null | undefined, saleNo: string | null | undefined): string {
  return `${brokerId ?? "?"}|${String(saleNo ?? "").replace(/^0+/, "") || "?"}`;
}

/** Broker+sale groups holding at least one sold lot. */
export function soldBrokerSaleKeys(
  lots: readonly { state?: string | null; brokerId: string | null; saleNo: string | null }[],
): Set<string> {
  return new Set(
    lots.filter((lot) => lot.state === "sold").map((lot) => brokerSaleKey(lot.brokerId, lot.saleNo)),
  );
}

/**
 * Broker+sale groups that have moved past `acknowledged` — a valuation or a
 * contract has landed for them.
 */
export function valuedBrokerSaleKeys(
  lots: readonly { state?: string | null; brokerId: string | null; saleNo: string | null }[],
): Set<string> {
  return new Set(
    lots
      .filter((lot) => lot.state === "valued" || lot.state === "sold")
      .map((lot) => brokerSaleKey(lot.brokerId, lot.saleNo)),
  );
}

/**
 * Was this lot left out of the valuation? Same shape as `isUnsoldLot`: the lot
 * is still `acknowledged` while its broker+sale group has moved on to `valued`
 * or `sold`, so the valuation for that group came and went without it.
 *
 * Derived on every read, never stored. A stored flag went stale the moment the
 * contract later sold the lot, and the sale page then reported lots as "Not
 * Valued" that had been valued and sold weeks earlier.
 */
export function isNotValuedLot(
  lot: { state?: string | null },
  groupHasValued: boolean,
): boolean {
  return lot.state === "acknowledged" && groupHasValued;
}

