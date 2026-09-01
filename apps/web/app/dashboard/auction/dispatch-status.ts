/**
 * The physical dispatch lifecycle.
 *
 * Only "dispatched" is a human decision — the dispatcher says the lorry left.
 * The two stages after it are consequences of what happened to the broker
 * invoices inside the dispatch, so they are derived rather than clicked:
 *
 *   draft      -> nothing has left yet
 *   dispatched -> the dispatcher marked it as gone (manual, the only one)
 *   received   -> every dispatch invoice in it reached GRN at the warehouse
 *   catalogued -> every dispatch invoice was acknowledged by its broker
 *
 * Deriving instead of storing transitions keeps the dispatch honest: adding a
 * fresh dispatch invoice to a catalogued dispatch pulls it back automatically,
 * which a one-way transition table would silently get wrong.
 */

export const DISPATCH_STATUSES = ["draft", "dispatched", "received", "catalogued"] as const;
export type DispatchStatus = (typeof DISPATCH_STATUSES)[number];

/**
 * How far a dispatch invoice has travelled. Only the ordering matters — a lot
 * that is already sold has clearly passed GRN, so comparisons are ">=" against
 * a threshold rather than equality against one status.
 */
const BROKER_INVOICE_RANK: Record<string, number> = {
  draft: 0,
  dispatched: 0, // legacy name for an unconfirmed draft
  invoiced: 1,
  grn: 2,
  catalogued: 3,
  valued: 4,
  sold: 5,
  settled: 6,
  broker_statement: 7,
};

const RANK_GRN = BROKER_INVOICE_RANK.grn;
const RANK_CATALOGUED = BROKER_INVOICE_RANK.catalogued;

export function brokerInvoiceRank(status: string | null | undefined): number {
  return BROKER_INVOICE_RANK[status ?? ""] ?? 0;
}

/**
 * The status a dispatch should currently be in.
 *
 * `dispatchedAt` is the record of the manual step. It is kept separately from
 * the status so that a dispatch which advanced to received/catalogued and then
 * gained a new draft invoice falls back to "dispatched" rather than "draft" —
 * the lorry did leave, and that fact does not un-happen.
 *
 * An empty dispatch can never be past "dispatched": there is nothing to have
 * been received or catalogued.
 */
export function deriveDispatchStatus(
  invoiceStatuses: readonly (string | null | undefined)[],
  dispatchedAt: string | Date | null | undefined,
): DispatchStatus {
  const manual: DispatchStatus = dispatchedAt ? "dispatched" : "draft";
  if (invoiceStatuses.length === 0) return manual;

  const ranks = invoiceStatuses.map(brokerInvoiceRank);
  const allAtLeast = (threshold: number) => ranks.every((rank) => rank >= threshold);

  if (allAtLeast(RANK_CATALOGUED)) return "catalogued";
  if (allAtLeast(RANK_GRN)) return "received";
  return manual;
}

/** Whether the dispatcher may still press "Mark as dispatched". */
export function canMarkDispatched(status: string | null | undefined): boolean {
  return status === "draft";
}

/**
 * Whether the dispatcher may bulk-complete GRN for every dispatch invoice inside
 * this dispatch. Only offered once the dispatch itself has been marked
 * dispatched, and not once it has already advanced past that on its own
 * (the invoices are already at or beyond GRN, so there is nothing left to do).
 */
export function canRecordDispatchGrn(status: string | null | undefined): boolean {
  return status === "dispatched";
}

export const DISPATCH_STATUS_LABELS: Record<DispatchStatus, string> = {
  draft: "Draft",
  dispatched: "Dispatched",
  received: "Received",
  catalogued: "Catalogued",
};
