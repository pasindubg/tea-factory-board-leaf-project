/**
 * Re-validation of a sale's revenue against the brokers' own sellers contracts.
 *
 * The app recomputes every deduction from a rate card. The contract states what
 * the broker actually paid. Those two agreeing is the only end-to-end proof
 * that nothing was lost between the PDF and the ledger — and they have silently
 * disagreed before: ten Asia Siyaka contracts dropped sale rows worth up to
 * LKR 1,802,000 each, and the recomputed settlement simply followed them down.
 *
 * Deliberately checked only once EVERY contract for the sale is confirmed. A
 * half-ingested sale is expected to differ, and warning then would train the
 * operator to ignore the warning that matters.
 *
 * Pure and framework-free: the sale page and the document page both call this,
 * so they cannot reach different verdicts about the same sale.
 */
export type ContractRevenueDoc = {
  /** doc_imports.id — lets the caller link a mismatch to the document. */
  id: string;
  brokerName: string | null;
  /** Σ Net Proceeds the contract prints. Null when the layout states none. */
  printedNetProceeds: number | null;
  /** Σ Insurance Cover the contract prints. Null when it states none. */
  printedInsurance?: number | null;
  /**
   * What OUR settlement charged for insurance against this same document —
   * Σ settlement_charges (code "insurance") for its broker invoices.
   *
   * Per document, not per sale: only one broker's contract states insurance,
   * and substituting its figure for the whole sale's computed insurance would
   * compare a part against the total.
   */
  computedInsurance?: number | null;
};

/** The VAT the broker adds to its own charges, e.g. 18. */
export type InsuranceContext = { chargesVatPct: number };

export type RevenueValidation =
  /** No confirmed contract yet — nothing to check. */
  | { status: "pending"; reason: string }
  /** Confirmed contracts exist but none printed a figure to check against. */
  | { status: "unavailable"; reason: string }
  | { status: "tallied"; printed: number; computed: number; documents: number }
  /**
   * Tallies once the broker's OWN insurance figure replaces ours. Everything
   * else agrees to the cent, so this is informative rather than wrong — the
   * caller shows it as a note, not an error.
   */
  | {
      status: "tallied-on-printed-insurance";
      printed: number;
      computed: number;
      computedInsurance: number;
      printedInsurance: number;
      insuranceDifference: number;
      documents: number;
    }
  | { status: "mismatch"; printed: number; computed: number; difference: number; documents: number };

/** Rounding across several blocks can legitimately land a cent or two out. */
const TOLERANCE = 0.05;

/**
 * Three rungs, in order:
 *
 *   1. our figure matches the contracts                    → tallied
 *   2. it matches once the broker's PRINTED insurance
 *      replaces our computed one, everything else equal    → tallied-on-printed-insurance
 *   3. neither                                             → mismatch
 *
 * Rung 2 exists because insurance is the one charge that cannot be recomputed:
 * Asia Siyaka levies it on a subset of lots by a rule its contract never
 * states. Substituting only that figure isolates it — if the sale then agrees
 * to the cent, every other charge was right, and the operator needs a note
 * rather than an alarm.
 *
 * Insurance sits inside the VAT-bearing charges, so swapping it moves
 * deductions by the difference PLUS the broker's VAT on it, and revenue the
 * other way.
 */
export function validateSaleRevenue(
  computedRevenue: number,
  docs: readonly ContractRevenueDoc[],
  insurance?: InsuranceContext,
): RevenueValidation {
  if (docs.length === 0) {
    return { status: "pending", reason: "No sellers contract has been confirmed for this sale yet." };
  }
  const withFigures = docs.filter((d) => d.printedNetProceeds != null);
  if (withFigures.length === 0) {
    return { status: "unavailable", reason: "No confirmed contract printed a net proceeds total to check against." };
  }
  const printed = round2(withFigures.reduce((sum, d) => sum + (d.printedNetProceeds ?? 0), 0));
  const computed = round2(computedRevenue);
  const documents = withFigures.length;
  const difference = round2(computed - printed);
  if (Math.abs(difference) <= TOLERANCE) return { status: "tallied", printed, computed, documents };

  // Rung 2 — only over the documents that actually printed an insurance
  // figure, each against OUR insurance for that same document.
  const printedInsuranceDocs = docs.filter((d) => d.printedInsurance != null && d.computedInsurance != null);
  if (insurance && printedInsuranceDocs.length > 0) {
    const printedInsurance = round2(printedInsuranceDocs.reduce((sum, d) => sum + (d.printedInsurance ?? 0), 0));
    const computedInsurance = round2(printedInsuranceDocs.reduce((sum, d) => sum + (d.computedInsurance ?? 0), 0));
    const insuranceDifference = round2(computedInsurance - printedInsurance);
    const withVat = insuranceDifference * (1 + insurance.chargesVatPct / 100);
    // Charging LESS insurance leaves MORE revenue.
    const adjusted = round2(computed + withVat);
    // The fallback only ever explains ONE thing: the broker insuring fewer lots
    // than we assume, so its figure is at or below ours. A printed insurance
    // ABOVE ours means something else is wrong, and letting the rung absorb it
    // would hide a real loss — a mutation test that deleted a page of sale
    // lines came back "tallied" through exactly this hole.
    const plausible = insuranceDifference >= 0 && printedInsurance >= 0;
    if (plausible && Math.abs(adjusted - printed) <= TOLERANCE) {
      return {
        status: "tallied-on-printed-insurance",
        printed, computed,
        computedInsurance,
        printedInsurance,
        insuranceDifference,
        documents,
      };
    }
  }

  return { status: "mismatch", printed, computed, difference, documents };
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
