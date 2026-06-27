// Reconciliation ① — invoice ↔ acknowledgement (docs/AUCTION.md §4①).
// Pure: compares the factory's invoiced lots against a parsed Acknowledgement and
// classifies every lot. The web review screen renders this; confirm persists it.
import type { ParsedAcknowledgement } from "./parse-acknowledgement";

export type InvoicedLot = { id: string; invoiceNo: string; grade: string; netWt: number };

export type ReconStatus = "catalogued" | "shutout" | "missing" | "unexpected";

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
  missing: number; // invoiced but absent from the acknowledgement
  unexpected: number; // in the acknowledgement but never invoiced
  weightMismatches: number;
  shutoutKg: number; // stock left at the warehouse, rolls to the next sale
};

export type Reconciliation = { rows: ReconRow[]; summary: ReconSummary };

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
      status: "missing",
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
    missing: count("missing"),
    unexpected: count("unexpected"),
    weightMismatches: rows.filter((r) => r.weightDelta != null && Math.abs(r.weightDelta) > 0.01).length,
    shutoutKg: Number(
      rows.filter((r) => r.status === "shutout").reduce((s, r) => s + (r.ack?.netWt ?? 0), 0).toFixed(2),
    ),
  };

  return { rows, summary };
}
