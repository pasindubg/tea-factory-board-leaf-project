// Reconciliation ② — valuation ↔ actual sale price (docs/AUCTION.md §4②).
// Pure: joins valuations and sale lines by lot and classifies each actual price
// against the broker's valuation range, with realised premium/discount.

export type ValuationInput = {
  lotId: string;
  invoiceNo: string;
  grade: string;
  netWt: number;
  priceMin: number | null;
  priceMax: number | null;
  projectedProceeds: number | null;
};

export type SaleInput = {
  lotId: string;
  pricePerKg: number;
  proceeds: number;
};

export type ValClass = "below" | "within" | "above" | "no-valuation";

export type ValReconRow = {
  lotId: string;
  invoiceNo: string;
  grade: string;
  netWt: number;
  priceMin: number | null;
  priceMax: number | null;
  pricePerKg: number;
  classification: ValClass;
  projectedProceeds: number | null;
  proceeds: number;
  variance: number | null; // proceeds − projectedProceeds
};

export type ValReconSummary = {
  lots: number;
  below: number;
  within: number;
  above: number;
  noValuation: number;
  totalProjected: number;
  totalProceeds: number;
  valuationAvg: number; // projected ÷ kg (weighted, lots with a valuation)
  realisedAvg: number; // proceeds ÷ kg
  premiumPct: number; // (realised − valuation) ÷ valuation × 100
};

export type ValReconciliation = { rows: ValReconRow[]; summary: ValReconSummary };

const r2 = (n: number) => Math.round(n * 100) / 100;

export function reconcileValuation(
  valuations: ValuationInput[],
  sales: SaleInput[],
): ValReconciliation {
  const valByLot = new Map(valuations.map((v) => [v.lotId, v]));
  const rows: ValReconRow[] = [];

  for (const s of sales) {
    const v = valByLot.get(s.lotId);
    let classification: ValClass = "no-valuation";
    if (v && v.priceMin != null && v.priceMax != null) {
      if (s.pricePerKg < v.priceMin) classification = "below";
      else if (s.pricePerKg > v.priceMax) classification = "above";
      else classification = "within";
    }
    rows.push({
      lotId: s.lotId,
      invoiceNo: v?.invoiceNo ?? "",
      grade: v?.grade ?? "",
      netWt: v?.netWt ?? 0,
      priceMin: v?.priceMin ?? null,
      priceMax: v?.priceMax ?? null,
      pricePerKg: s.pricePerKg,
      classification,
      projectedProceeds: v?.projectedProceeds ?? null,
      proceeds: s.proceeds,
      variance: v?.projectedProceeds != null ? r2(s.proceeds - v.projectedProceeds) : null,
    });
  }

  const withVal = rows.filter((r) => r.classification !== "no-valuation");
  const kgWithVal = withVal.reduce((s, r) => s + r.netWt, 0);
  const totalProjected = r2(withVal.reduce((s, r) => s + (r.projectedProceeds ?? 0), 0));
  const totalProceeds = r2(rows.reduce((s, r) => s + r.proceeds, 0));
  const proceedsWithVal = withVal.reduce((s, r) => s + r.proceeds, 0);
  const valuationAvg = kgWithVal > 0 ? r2(totalProjected / kgWithVal) : 0;
  const realisedAvg = kgWithVal > 0 ? r2(proceedsWithVal / kgWithVal) : 0;
  const premiumPct = valuationAvg > 0 ? r2(((realisedAvg - valuationAvg) / valuationAvg) * 100) : 0;

  const count = (c: ValClass) => rows.filter((r) => r.classification === c).length;
  return {
    rows,
    summary: {
      lots: rows.length,
      below: count("below"),
      within: count("within"),
      above: count("above"),
      noValuation: count("no-valuation"),
      totalProjected,
      totalProceeds,
      valuationAvg,
      realisedAvg,
      premiumPct,
    },
  };
}
