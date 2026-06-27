// Pure parser for the Tea Sellers Contract & Account Sales (text already extracted
// from the PDF). Each line:
//   <Buyer> <LotNo> <InvNo> <Grade> "<N> Bags" <Gross> <S/Allw> <Net> <Price>
//   <Proceeds> <VAT> <Proceeds+VAT><buyerVatNo> <YES|NO>
// The buyer VAT no is mashed onto the end of Proceeds+VAT; the buyer NAME precedes
// the lot and is bounded on the left by the "Bank Guarantee" header label. A1's
// deduction stack (insurance, brokerage, …) is deferred to A3. Feeds recon ② / ③.

export type ContractLine = {
  contractNo: string;
  markCode: string;
  markName: string;
  buyerName: string;
  buyerVatNo: string;
  lotNo: string;
  invoiceNo: string;
  grade: string;
  bags: number;
  grossWt: number;
  sampleAllowance: number;
  netWt: number;
  pricePerKg: number;
  proceeds: number;
  vatAmount: number;
  proceedsPlusVat: number;
  onGuarantee: boolean;
};

export type ParsedContract = {
  docType: "contract";
  saleNo: string | null;
  saleDate: string | null;
  promptDate: string | null;
  contracts: { contractNo: string; markCode: string; markName: string }[];
  lines: ContractLine[];
  issues: string[];
};

const num = (s: string) => Number(s.replace(/,/g, ""));

const HEADER =
  /(\d{4}\/\d{3}\/\d{4})\s+TEA SELLERS CONTRACT[\s\S]*?AUCTION SALE\s+(MF\d+[A-Z]?)\s*\|\s*([A-Z]+)/g;
const CORE =
  /(\d{3,4})\s+(\d{3,4})\s+([A-Z][A-Z0-9]*)\s+(\d+)\s+Bags\s+([\d,]+\.\d{2})\s+([\d.]+)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})(\d{9}-\d{4})\s+(YES|NO)/g;

export function isContract(text: string): boolean {
  return /TEA SELLERS CONTRACT & ACCOUNT SALES/.test(text);
}

export function parseContract(rawText: string): ParsedContract {
  const text = rawText.replace(/\s+/g, " ").trim();

  // Contract/mark headers, in document order (dedup by contractNo, keep first).
  const headers = [...text.matchAll(HEADER)].map((m) => ({
    contractNo: m[1],
    markCode: m[2],
    markName: m[3],
    index: m.index ?? 0,
  }));
  const headerAt = (i: number) => {
    let h = headers[0];
    for (const cand of headers) if (cand.index <= i) h = cand;
    return h;
  };
  const contracts = [...new Map(headers.map((h) => [h.contractNo, h])).values()].map((h) => ({
    contractNo: h.contractNo,
    markCode: h.markCode,
    markName: h.markName,
  }));

  const saleNo = contracts[0] ? contracts[0].contractNo.split("/").slice(0, 2).join("-") : null;
  const dates = text.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+:\s*:\s*:/);
  const saleDate = dates?.[1] ?? null;
  const promptDate = dates?.[2] ?? null;

  const lines: ContractLine[] = [];
  let prevEnd = 0;
  for (const m of text.matchAll(CORE)) {
    const start = m.index ?? 0;
    // Buyer name = text since the previous line, after the last "Bank Guarantee" label.
    const gap = text.slice(prevEnd, start);
    const buyerName = (gap.split("Bank Guarantee").pop() ?? "").replace(/\s+/g, " ").trim();
    const h = headerAt(start);
    lines.push({
      contractNo: h?.contractNo ?? "",
      markCode: h?.markCode ?? "",
      markName: h?.markName ?? "",
      buyerName,
      buyerVatNo: m[12],
      lotNo: m[1],
      invoiceNo: m[2],
      grade: m[3],
      bags: Number(m[4]),
      grossWt: num(m[5]),
      sampleAllowance: num(m[6]),
      netWt: num(m[7]),
      pricePerKg: num(m[8]),
      proceeds: num(m[9]),
      vatAmount: num(m[10]),
      proceedsPlusVat: num(m[11]),
      onGuarantee: m[13] === "YES",
    });
    prevEnd = start + m[0].length;
  }

  const issues: string[] = [];
  if (lines.length === 0) issues.push("No contract lines could be parsed.");
  for (const l of lines) {
    if (Math.abs(l.netWt - (l.grossWt - l.sampleAllowance)) > 0.01)
      issues.push(`Lot ${l.invoiceNo}: net ≠ gross − sample allowance.`);
    if (Math.abs(l.proceeds - l.netWt * l.pricePerKg) > 0.5)
      issues.push(`Lot ${l.invoiceNo}: proceeds ≠ net × price/kg.`);
    if (Math.abs(l.vatAmount - l.proceeds * 0.18) > 0.5)
      issues.push(`Lot ${l.invoiceNo}: VAT ≠ 18% of proceeds.`);
    if (Math.abs(l.proceedsPlusVat - (l.proceeds + l.vatAmount)) > 0.01)
      issues.push(`Lot ${l.invoiceNo}: proceeds+VAT mismatch.`);
    if (!l.buyerName) issues.push(`Lot ${l.invoiceNo}: buyer name not captured.`);
  }

  return { docType: "contract", saleNo, saleDate, promptDate, contracts, lines, issues };
}
