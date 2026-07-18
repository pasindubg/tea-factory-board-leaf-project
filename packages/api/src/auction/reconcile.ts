// Reconciliation ① — invoice ↔ acknowledgement (docs/AUCTION.md §4①).
// Pure: compares the factory's invoiced lots against a parsed Acknowledgement and
// classifies every lot. The web review screen renders this; confirm persists it.
import type { ParsedAcknowledgement } from "./parse-acknowledgement";

export type InvoicedLot = { id: string; invoiceNo: string; grade: string; netWt: number };

// Acknowledgements are PARTIAL: a lot the factory dispatched but the broker has
// not yet catalogued is `pending` (it may appear in a later ack / roll to a later
// sale), NOT an error. Only an explicit human decision marks a lot genuinely
// `missing` (see the orphan resolver) — the pure reconciliation never does.
export type ReconStatus = "catalogued" | "shutout" | "pending" | "unexpected";

export type ReconRow = {
  invoiceNo: string;
  status: ReconStatus;
  invoiced: { id: string; grade: string; netWt: number } | null;
  ack: { lotNo: string | null; markCode: string; grade: string; netWt: number } | null;
  weightDelta: number | null; // ack.netWt − invoiced.netWt
  gradeMismatch: boolean;
};

export type ReconSummary = {
  catalogued: number;
  shutout: number;
  pending: number; // dispatched but absent from this (partial) ack — may roll forward
  unexpected: number; // in the acknowledgement but never invoiced
  weightMismatches: number;
  shutoutKg: number; // stock left at the warehouse, rolls to the next sale
  pendingKg: number; // dispatched stock still at the store, not yet catalogued
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
  relatedStatus: "pending" | "unexpected";
  rows: Array<{ invoiceNo: string; status: "pending" | "unexpected"; kg: number }>;
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

    // If the document prints more catalogue weight than was parsed, the most
    // useful factory-side lead is an invoice still pending from this partial
    // acknowledgement. In the reverse direction, an unexpected parsed line is
    // the useful lead. Do not label either as a confirmed cause.
    const relatedStatus: ParseWarningRelation["relatedStatus"] = differenceKg > 0 ? "pending" : "unexpected";
    const targetKg = Math.abs(differenceKg);
    const toleranceKg = Math.max(0.01, targetKg * 0.02);
    const candidates = rows
      .filter((row) => row.status === relatedStatus)
      .map((row) => ({
        invoiceNo: row.invoiceNo,
        status: relatedStatus,
        kg: row.status === "pending" ? row.invoiced?.netWt ?? 0 : row.ack?.netWt ?? 0,
      }))
      .filter((row) => row.kg > 0)
      .sort((a, b) => Math.abs(targetKg - a.kg) - Math.abs(targetKg - b.kg) || a.invoiceNo.localeCompare(b.invoiceNo));

    const nearest = candidates[0];
    if (!nearest || Math.abs(targetKg - nearest.kg) > toleranceKg) return [];

    return [{ issue, parsedKg, printedKg, differenceKg, relatedStatus, rows: [nearest] }];
  });
}

const normGrade = (g: string) => g.toUpperCase().replace(/\s+/g, "");

export function reconcileAcknowledgement(
  invoiced: InvoicedLot[],
  ack: ParsedAcknowledgement,
): Reconciliation {
  const byInvoice = new Map(invoiced.map((l) => [l.invoiceNo, l]));
  const matched = new Set<string>();
  const rows: ReconRow[] = [];

  for (const lot of ack.lots) {
    const inv = byInvoice.get(lot.invoiceNo);
    const ackSide = { lotNo: lot.lotNo, markCode: lot.markCode, grade: lot.grade, netWt: lot.netWt };
    if (inv) {
      matched.add(inv.invoiceNo);
      rows.push({
        invoiceNo: lot.invoiceNo,
        status: lot.section, // "catalogued" | "shutout"
        invoiced: { id: inv.id, grade: inv.grade, netWt: inv.netWt },
        ack: ackSide,
        weightDelta: Number((lot.netWt - inv.netWt).toFixed(2)),
        gradeMismatch: normGrade(inv.grade) !== normGrade(lot.grade),
      });
    } else {
      rows.push({
        invoiceNo: lot.invoiceNo,
        status: "unexpected",
        invoiced: null,
        ack: ackSide,
        weightDelta: null,
        gradeMismatch: false,
      });
    }
  }

  for (const inv of invoiced) {
    if (matched.has(inv.invoiceNo)) continue;
    rows.push({
      invoiceNo: inv.invoiceNo,
      status: "pending",
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
    pending: count("pending"),
    unexpected: count("unexpected"),
    weightMismatches: rows.filter((r) => r.weightDelta != null && Math.abs(r.weightDelta) > 0.01).length,
    shutoutKg: Number(
      rows.filter((r) => r.status === "shutout").reduce((s, r) => s + (r.ack?.netWt ?? 0), 0).toFixed(2),
    ),
    pendingKg: Number(
      rows.filter((r) => r.status === "pending").reduce((s, r) => s + (r.invoiced?.netWt ?? 0), 0).toFixed(2),
    ),
  };

  return { rows, summary };
}
