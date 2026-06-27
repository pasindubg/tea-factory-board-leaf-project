// Pure contract-math engine — computes the broker's Account Sales settlement
// from effective broker_rates and per-contract aggregates (docs/AUCTION.md §7).
// Returns every charge line plus the settlement totals. Rounding is half-up to
// 2 decimal places (the `r2` helper).
//
// This is a pure, fixture-testable function — no DB dependency.

export type RateCard = {
  insurancePerKg: number;
  publicSaleExPerLot: number;
  brokeragePct: number;       // 1.00 = 1%
  handlingPerKg: number;
  documentationPerLot: number;
  eplatformPerKg: number;
  govtReliefLoan: number;
  chargesVatPct: number;      // 18.00 = 18%
  proceedsVatPct: number;     // 18.00 = 18%
};

export type ContractAggregates = {
  contractNo: string;
  netKg: number;
  lotCount: number;
  proceedsTotal: number;      // Σ sale-line proceeds
};

export type ChargeLine = {
  code: string;
  label: string;
  basis: "per_kg" | "per_lot" | "pct" | "flat";
  rate: number;
  amount: number;
  sortOrder: number;
};

export type SettlementResult = {
  contractNo: string;
  netKg: number;
  lotCount: number;
  proceedsTotal: number;
  insurance: number;
  publicSaleEx: number;
  brokerage: number;
  handling: number;
  documentation: number;
  chargesSubtotal: number;
  chargesVat: number;         // broker's VAT on its fees (auction input VAT)
  eplatform: number;
  govtReliefLoan: number;
  totalDeductions: number;
  netProceeds: number;
  outputVat: number;          // collected from buyer on seller's behalf
  totalNetProceeds: number;   // what the broker pays the factory
  charges: ChargeLine[];
  // Per-invariant: netProceeds == proceedsTotal − totalDeductions
  //                totalNetProceeds == netProceeds + outputVat
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function computeSettlement(
  rateCard: RateCard,
  agg: ContractAggregates,
): SettlementResult {
  const { netKg, lotCount, proceedsTotal } = agg;

  const insurance     = r2(netKg * rateCard.insurancePerKg);
  const publicSaleEx  = r2(lotCount * rateCard.publicSaleExPerLot);
  const brokerage     = r2(proceedsTotal * rateCard.brokeragePct / 100);
  const handling      = r2(netKg * rateCard.handlingPerKg);
  const documentation = r2(lotCount * rateCard.documentationPerLot);
  const chargesSubtotal = r2(insurance + publicSaleEx + brokerage + handling + documentation);
  const chargesVat    = r2(chargesSubtotal * rateCard.chargesVatPct / 100);
  const eplatform     = r2(netKg * rateCard.eplatformPerKg);
  const govtReliefLoan = r2(rateCard.govtReliefLoan);

  const totalDeductions = r2(chargesSubtotal + chargesVat + govtReliefLoan + eplatform);
  const netProceeds    = r2(proceedsTotal - totalDeductions);
  const outputVat      = r2(proceedsTotal * rateCard.proceedsVatPct / 100);
  const totalNetProceeds = r2(netProceeds + outputVat);

  const charges: ChargeLine[] = [
    { code: "insurance",       label: "Insurance",         basis: "per_kg", rate: rateCard.insurancePerKg,       amount: insurance,     sortOrder: 1 },
    { code: "public_sale_ex",  label: "Public Sale Ex.",   basis: "per_lot",rate: rateCard.publicSaleExPerLot,   amount: publicSaleEx,  sortOrder: 2 },
    { code: "brokerage",       label: "Brokerage",         basis: "pct",    rate: rateCard.brokeragePct,         amount: brokerage,     sortOrder: 3 },
    { code: "handling",        label: "Handling",          basis: "per_kg", rate: rateCard.handlingPerKg,        amount: handling,      sortOrder: 4 },
    { code: "documentation",   label: "Documentation",     basis: "per_lot",rate: rateCard.documentationPerLot,  amount: documentation, sortOrder: 5 },
    { code: "charges_vat",     label: "VAT on charges",    basis: "pct",    rate: rateCard.chargesVatPct,        amount: chargesVat,    sortOrder: 6 },
    { code: "eplatform",       label: "E-Platform",        basis: "per_kg", rate: rateCard.eplatformPerKg,       amount: eplatform,     sortOrder: 7 },
    { code: "govt_relief_loan",label: "Govt Relief Loan",  basis: "flat",   rate: rateCard.govtReliefLoan,       amount: govtReliefLoan,sortOrder: 8 },
  ];

  return {
    contractNo: agg.contractNo,
    netKg, lotCount, proceedsTotal,
    insurance, publicSaleEx, brokerage, handling, documentation,
    chargesSubtotal, chargesVat, eplatform, govtReliefLoan,
    totalDeductions, netProceeds, outputVat, totalNetProceeds,
    charges,
  };
}
