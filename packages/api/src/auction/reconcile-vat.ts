// Reconciliation ③ — VAT split, remittance ledger, and contract-math verification
// (docs/AUCTION.md §4③). Pure: takes sale lines + settlement totals and produces
// the VAT summary (cash vs guarantee) plus the net payable to the government.

export type VatLineInput = {
  saleLineId: string;
  lotId: string;
  invoiceNo: string;
  proceeds: number;
  vatAmount: number;
  onGuarantee: boolean;
};

export type VatReconLine = {
  saleLineId: string;
  lotId: string;
  invoiceNo: string;
  proceeds: number;
  vatAmount: number;
  mode: "cash" | "guarantee";
  flow: "auction_output"; // seam for future flows (auction_input, supplier_vat)
};

export type VatReconSummary = {
  totalProceeds: number;
  outputVat: number;       // 18% of total proceeds
  cashVat: number;          // Σ vat where mode = cash
  guaranteedVat: number;    // Σ vat where mode = guarantee
  inputVat: number;         // broker charges-VAT (from settlement)
  netVatPayable: number;    // outputVat − inputVat
  cashLotCount: number;
  guaranteeLotCount: number;
};

export type VatReconciliation = {
  lines: VatReconLine[];
  summary: VatReconSummary;
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function reconcileVat(
  saleLines: VatLineInput[],
  inputVat: number, // Σ broker charges-VAT across all contracts
): VatReconciliation {
  const lines: VatReconLine[] = [];
  let totalProceeds = 0;
  let cashVat = 0;
  let guaranteedVat = 0;
  let cashCount = 0;
  let guaranteeCount = 0;

  for (const l of saleLines) {
    totalProceeds = r2(totalProceeds + l.proceeds);
    const mode = l.onGuarantee ? "guarantee" : "cash";
    if (mode === "cash") { cashVat = r2(cashVat + l.vatAmount); cashCount++; }
    else { guaranteedVat = r2(guaranteedVat + l.vatAmount); guaranteeCount++; }
    lines.push({
      saleLineId: l.saleLineId,
      lotId: l.lotId,
      invoiceNo: l.invoiceNo,
      proceeds: l.proceeds,
      vatAmount: l.vatAmount,
      mode,
      flow: "auction_output",
    });
  }

  const outputVat = r2(cashVat + guaranteedVat);
  const netVatPayable = r2(outputVat - inputVat);

  return {
    lines,
    summary: {
      totalProceeds,
      outputVat,
      cashVat,
      guaranteedVat,
      inputVat,
      netVatPayable,
      cashLotCount: cashCount,
      guaranteeLotCount: guaranteeCount,
    },
  };
}
