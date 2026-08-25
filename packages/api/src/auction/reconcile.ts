// Reconciliation ① — invoice ↔ acknowledgement (docs/AUCTION.md §4①).
// Pure: compares the factory's invoiced lots against a parsed Acknowledgement and
// classifies every lot. The web review screen renders this; confirm persists it.
import type { ParsedAcknowledgement } from "./parse-acknowledgement";
import { invoiceMatchKey } from "./invoice-key";

// `netWt` is already net of `sampleAllowance` on our side (net_wt = gross_wt -
// sample_allowance), but the broker's printed catalogue weight is the GROSS
// figure — sample is drawn at their end, not ours. Comparing net to their gross
// reports a mismatch on every lot that has a sample at all, so `sampleAllowance`
// must be added back before the two sides are compared.
export type InvoicedLot = { id: string; invoiceNo: string; grade: string; netWt: number; sampleAllowance?: number };

// ONE rule: is this invoice in the acknowledgement?
//
//   in the acknowledgement  → "catalogued"  (or "shutout", which is catalogued
//                              with the broker's held-back reason attached —
//                              not a third outcome)
//   not in it               → "not-acknowledged"
//
// Nothing else classifies. Whether we also invoiced an acknowledged lot is not
// a status; it is visible from `invoiced` being null on the row.
export type ReconStatus = "catalogued" | "shutout" | "not-acknowledged";

export type ReconRow = {
  invoiceNo: string;
  status: ReconStatus;
  invoiced: { id: string; grade: string; netWt: number } | null;
  ack: { lotNo: string | null; markCode: string; grade: string; netWt: number; shutoutReason: string | null; reprint: boolean } | null;
  weightDelta: number | null; // ack.netWt − invoiced.netWt
  gradeMismatch: boolean;
};

export type ReconSummary = {
  catalogued: number;
  shutout: number;
  notAcknowledged: number; // invoiced by us, absent from this ack — may roll forward
  weightMismatches: number;
  shutoutKg: number; // stock left at the warehouse, rolls to the next sale
  notAcknowledgedKg: number; // invoiced stock this ack does not mention
  // Σ(ack.netWt − invoiced.netWt) over every row the ack actually matched to an
  // invoice (catalogued or shutout). Individual weightDelta values can offset
  // each other, so this is a total-level check — the broker's catalogued
  // weight for this document, against ours, net of every row.
  totalMismatchKg: number;
};

export type Reconciliation = { rows: ReconRow[]; summary: ReconSummary };

/**
 * A parser warning describes what was printed in the broker document, while a
 * reconciliation row describes what happened to a factory invoice. This keeps
 * the two views connected without treating a close weight as a proven match.
 */
export type ParseWarningRelation = {
  issue: string;
  parsedKg: number;
  printedKg: number;
  differenceKg: number;
  rows: Array<{ invoiceNo: string; status: ReconStatus; kg: number }>;
};

const CATALOGUED_KG_ISSUE = /^Catalogued kg parsed \(([\d,.]+)\) ≠ printed total \(([\d,.]+)\)\.$/;

/**
 * Finds reconciliation rows whose quantity is close enough to a catalogue-total
 * parse gap to warrant review. The result is intentionally advisory: a parser
 * warning alone must never change a lot's state or create an automatic match.
 */
export function relateAcknowledgementParseWarnings(
  issues: string[],
  rows: ReconRow[],
): ParseWarningRelation[] {
  return issues.flatMap((issue) => {
    const match = issue.match(CATALOGUED_KG_ISSUE);
    if (!match) return [];

    const parsedKg = Number(match[1].replace(/,/g, ""));
    const printedKg = Number(match[2].replace(/,/g, ""));
    const differenceKg = Number((printedKg - parsedKg).toFixed(2));
    if (Math.abs(differenceKg) <= 0.01) return [];

    // More printed than parsed → the gap is most likely one of OUR invoices the
    // ack does not mention. Less → an ack line we never invoiced. Each of those
    // rows has exactly one side filled in, so its weight is whichever is there.
    // Advisory only: never label a close weight as a confirmed cause.
    const targetKg = Math.abs(differenceKg);
    const toleranceKg = Math.max(0.01, targetKg * 0.02);
    const candidates = rows
      .filter((row) => (differenceKg > 0 ? !row.ack : !row.invoiced))
      .map((row) => ({
        invoiceNo: row.invoiceNo,
        status: row.status,
        kg: row.invoiced?.netWt ?? row.ack?.netWt ?? 0,
      }))
      .filter((row) => row.kg > 0)
      .sort((a, b) => Math.abs(targetKg - a.kg) - Math.abs(targetKg - b.kg) || a.invoiceNo.localeCompare(b.invoiceNo));

    const nearest = candidates[0];
    if (!nearest || Math.abs(targetKg - nearest.kg) > toleranceKg) return [];

    return [{ issue, parsedKg, printedKg, differenceKg, rows: [nearest] }];
  });
}

const normGrade = (g: string) => g.toUpperCase().replace(/\s+/g, "");

export function reconcileAcknowledgement(
  invoiced: InvoicedLot[],
  ack: ParsedAcknowledgement,
): Reconciliation {
  // Keyed on the bare sequence, not the stored string: the factory's numbers
  // carry an index-cycle prefix ("26I01-0001") that a broker document never
  // prints. Matching verbatim would leave every line not-acknowledged.
  const byInvoice = new Map(invoiced.map((l) => [invoiceMatchKey(l.invoiceNo), l]));
  const matched = new Set<string>();
  const rows: ReconRow[] = [];

  // Every line the acknowledgement prints IS acknowledged — `lot.section` says
  // whether the broker catalogued it or held it back, and that is the whole
  // decision. Having our own invoice for it only enriches the row (full number,
  // weight delta, grade check); it never changes the status.
  for (const lot of ack.lots) {
    const inv = byInvoice.get(invoiceMatchKey(lot.invoiceNo));
    if (inv) matched.add(invoiceMatchKey(inv.invoiceNo));
    rows.push({
      // The factory's own full number when we have it; the broker's bare one
      // is otherwise all there is.
      invoiceNo: inv?.invoiceNo ?? lot.invoiceNo,
      status: lot.section, // "catalogued" | "shutout"
      invoiced: inv ? { id: inv.id, grade: inv.grade, netWt: inv.netWt } : null,
      ack: { lotNo: lot.lotNo, markCode: lot.markCode, grade: lot.grade, netWt: lot.netWt, shutoutReason: lot.shutoutReason, reprint: lot.reprint },
      weightDelta: inv ? Number((lot.netWt - (inv.netWt + (inv.sampleAllowance ?? 0))).toFixed(2)) : null,
      gradeMismatch: inv ? normGrade(inv.grade) !== normGrade(lot.grade) : false,
    });
  }

  // Anything we invoiced that the acknowledgement never mentioned.
  for (const inv of invoiced) {
    if (matched.has(invoiceMatchKey(inv.invoiceNo))) continue;
    rows.push({
      invoiceNo: inv.invoiceNo,
      status: "not-acknowledged",
      invoiced: { id: inv.id, grade: inv.grade, netWt: inv.netWt },
      ack: null,
      weightDelta: null,
      gradeMismatch: false,
    });
  }

  const count = (s: ReconStatus) => rows.filter((r) => r.status === s).length;
  const summary: ReconSummary = {
    catalogued: count("catalogued"),
    shutout: count("shutout"),
    notAcknowledged: count("not-acknowledged"),
    weightMismatches: rows.filter((r) => r.weightDelta != null && Math.abs(r.weightDelta) > 0.01).length,
    shutoutKg: Number(
      rows.filter((r) => r.status === "shutout").reduce((s, r) => s + (r.ack?.netWt ?? 0), 0).toFixed(2),
    ),
    notAcknowledgedKg: Number(
      rows.filter((r) => r.status === "not-acknowledged").reduce((s, r) => s + (r.invoiced?.netWt ?? 0), 0).toFixed(2),
    ),
    totalMismatchKg: Number(
      rows.reduce((s, r) => s + (r.weightDelta ?? 0), 0).toFixed(2),
    ),
  };

  return { rows, summary };
}
