// Carry-forward matcher — the rule that decides whether an acknowledgement row
// the factory did not expect is actually a lot this system already holds.
// Pure & framework-free so it can be exercised against real documents.
//
// A broker can catalogue the same invoice again in a later sale. When it does,
// the row arrives classified `unexpected` (recon ① compares against the lots
// invoiced for THIS sale, and the lot belongs to an earlier one). Before
// creating a duplicate ACK-sourced lot, this decides which stored lot the row
// is really about, so invoice history stays on one lot id.
//
// Two things ride on the same rule:
//
//  1. **Roll-forward** — an unsold lot from an earlier broker invoice moves
//     into this sale, keeping its id.
//  2. **The re-print chain** — when the matched lot is in `re-print`, a CHILD
//     lot is created for the new sale, linked back through
//     `reprint_source_lot_id`. This is also how a re-print the factory had
//     outstanding before it started using this system gets resolved: the
//     operator registers it on the Re-prints page as a real lot in `re-print`,
//     and it then matches here like any other. An invoice that was never
//     registered still has no counterpart and stays `unexpected` — which is
//     the point, because that is a genuine anomaly.

import { invoiceNumbersMatch } from "./invoice-key";

/** States a lot can never be carried forward out of: the money is already
 * recorded against it. */
export const CARRY_FORWARD_BLOCKED_STATES: ReadonlySet<string> = new Set(["sold"]);

/**
 * PostgREST `or=` terms that FETCH the lots this matcher should judge.
 *
 * It lives next to the matcher because the two must agree: the matcher sees
 * through the factory's index-cycle prefix (`invoiceMatchKey`), so a fetch that
 * compares verbatim would hand it an empty candidate list and every prefixed
 * lot would silently stay `unexpected`. That is a real bug this code had —
 * a broker prints "0909" while the factory stores "26I02-0909", so
 * `invoice_no.in.(0909)` matched nothing.
 *
 * Both stored shapes are covered: a bare number, and any prefix followed by
 * the number. Numbers are four-digit padded on both sides before they get
 * here, so an equality/suffix test is sufficient; the matcher still makes the
 * final decision, and over-fetching a near-miss is harmless.
 */
export function carryForwardInvoiceFilters(invoiceNos: readonly string[], column = "invoice_no"): string[] {
  return invoiceNos.flatMap((invoiceNo) => [`${column}.eq.${invoiceNo}`, `${column}.like.*-${invoiceNo}`]);
}

export type CarryForwardCandidate = {
  id: string;
  saleId: string;
  invoiceNo: string | null;
  lotNo: string | null;
  state: string | null;
  brokerId: string | null;
  /** Broker-invoice dispatch date; the most recent match wins. */
  dispatchDate: string | null;
  /** Every invoice number linked to the lot, not just its primary one. */
  invoiceNos: string[];
  /** True when a sale_line already exists for this lot. */
  hasSaleLine: boolean;
};

export type CarryForwardRow = {
  invoiceNo: string;
  lotNo: string | null;
};

export type CarryForwardMatch =
  /** Matched a lot that can move — roll it forward, or chain it when `re-print`. */
  | { status: "matched"; candidate: CarryForwardCandidate }
  /** Matched only lots whose sale is already recorded; a human must resolve it. */
  | { status: "blocked"; candidate: CarryForwardCandidate }
  /** Nothing in the factory's records is this row — genuinely unexpected. */
  | { status: "unmatched" };

/**
 * Whether a stored lot is even eligible to be considered for an ACK row.
 *
 * `groupSaleIds` are the broker invoices this acknowledgement already covers —
 * a lot inside them is not being carried forward, it is simply being
 * acknowledged. The broker gate is deliberate: a lot catalogued by a DIFFERENT
 * broker than the one that sent this document is not the same commercial
 * event, and silently matching across brokers would mask exactly the anomaly
 * this classification exists to surface.
 */
export function isCarryForwardCandidate(
  lot: CarryForwardCandidate,
  context: { groupSaleIds: readonly string[]; brokerId: string | null },
): boolean {
  if (context.groupSaleIds.includes(lot.saleId)) return false;
  if (context.brokerId && lot.brokerId !== context.brokerId) return false;
  return true;
}

/** A candidate that is eligible AND free to move. */
function isMovable(lot: CarryForwardCandidate): boolean {
  return !CARRY_FORWARD_BLOCKED_STATES.has(lot.state ?? "") && !lot.hasSaleLine;
}

/**
 * Lot-number comparison, on the same four-digit normalisation the screens use
 * (`formatFourDigitNo`): pad the trailing run of digits to four and compare
 * verbatim, so any letter prefix the broker prints ("B1265") still has to
 * agree. Unlike an invoice number, a lot number is only ever the broker's own
 * catalogue reference, so there is no factory prefix to see through.
 */
function fourDigitNo(value: string | null): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d+$/.test(raw)) return raw.padStart(4, "0");
  return raw.replace(/\d+$/, (digits) => digits.padStart(4, "0"));
}

function lotNumbersMatch(left: string | null, right: string | null): boolean {
  const a = fourDigitNo(left);
  const b = fourDigitNo(right);
  return a !== "" && a === b;
}

/**
 * Resolves one acknowledgement row against the eligible candidates.
 *
 * `usedLotIds` carries across rows in a single document so two rows cannot
 * both claim the same stored lot; pass the same set through the loop.
 */
export function matchCarryForwardLot(
  row: CarryForwardRow,
  candidates: readonly CarryForwardCandidate[],
  usedLotIds: ReadonlySet<string> = new Set(),
): CarryForwardMatch {
  const matches = candidates
    .filter((lot) => {
      if (usedLotIds.has(lot.id)) return false;
      const invoiceMatches =
        invoiceNumbersMatch(lot.invoiceNo, row.invoiceNo) ||
        lot.invoiceNos.some((invoiceNo) => invoiceNumbersMatch(invoiceNo, row.invoiceNo));
      return invoiceMatches || lotNumbersMatch(lot.lotNo, row.lotNo);
    })
    // Most recently dispatched first: if an invoice number was somehow reused,
    // the latest record is the one the broker is talking about.
    .sort((a, b) => String(b.dispatchDate ?? "").localeCompare(String(a.dispatchDate ?? "")));

  const movable = matches.find(isMovable);
  if (movable) return { status: "matched", candidate: movable };
  if (matches.length > 0) return { status: "blocked", candidate: matches[0] };
  return { status: "unmatched" };
}
