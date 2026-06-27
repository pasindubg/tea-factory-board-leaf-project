// Pure parser for a broker Valuation Report (text already extracted from the PDF).
// Each lot row: LotNo InvNo Grade "10 B @ 28" NetWt <valuation>/= <projected> <description…>
// where <valuation> is "1600" (point) or "1350-1400" (range), and the description
// runs to the next lot row. Feeds reconciliation ② (docs/AUCTION.md §4②).

export type ValuationLot = {
  markCode: string;
  markName: string;
  lotNo: string;
  invoiceNo: string;
  grade: string;
  bags: number;
  kgPerBag: number;
  netWt: number;
  priceMin: number;
  priceMax: number;
  projectedProceeds: number;
  tastingNote: string;
};

export type ParsedValuation = {
  docType: "valuation";
  saleNo: string | null;
  saleDate: string | null; // dd/mm/yyyy (sale day)
  lots: ValuationLot[];
  issues: string[];
};

const num = (s: string) => Number(s.replace(/,/g, ""));

const MARK_HEADER = /(MF\d+[A-Z]?)\s+([A-Z][A-Z ]*?)\s+Valuation Report/g;
const ROW =
  /(\d{3,4})\s+(\d{3,4})\s+([A-Z][A-Z0-9]*)\s+(\d+)\s*B\s*@\s*(\d+)\s+([\d.]+)\s+([\d,]+(?:-[\d,]+)?)\s*\/=\s+([\d,]+\.\d{2})\s+(.*?)(?=\s+\d{3,4}\s+\d{3,4}\s+[A-Z][A-Z0-9]*\s+\d+\s*B|\s+Dear Sir|\s+LIQUORS|$)/g;

export function isValuation(text: string): boolean {
  return /Valuation Report/.test(text) && /PROJECTED\s+PROCEEDS|DESCRIPTION OF DRY LEAF/.test(text);
}

export function parseValuation(rawText: string): ParsedValuation {
  const text = rawText.replace(/\s+/g, " ").trim();
  const saleMatch = text.match(/Sale Number\s+(\d{4})\s*-\s*(\d{3})/);
  const saleNo = saleMatch ? `${saleMatch[1]}-${saleMatch[2]}` : null;
  const saleDate = text.match(/(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/)?.[2] ?? null;

  const marks = [...text.matchAll(MARK_HEADER)].map((m) => ({
    code: m[1],
    name: m[2].trim(),
    start: m.index ?? 0,
  }));

  const lots: ValuationLot[] = [];
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i];
    const chunk = text.slice(mark.start, marks[i + 1]?.start ?? text.length);
    for (const r of chunk.matchAll(ROW)) {
      const [min, max] = r[7].split("-");
      lots.push({
        markCode: mark.code,
        markName: mark.name,
        lotNo: r[1],
        invoiceNo: r[2],
        grade: r[3],
        bags: Number(r[4]),
        kgPerBag: num(r[5]),
        netWt: num(r[6]),
        priceMin: num(min),
        priceMax: num(max ?? min),
        projectedProceeds: num(r[8]),
        tastingNote: r[9].replace(/\s+/g, " ").trim(),
      });
    }
  }

  const issues: string[] = [];
  if (lots.length === 0) issues.push("No valuation rows could be parsed.");
  for (const l of lots) {
    if (Math.abs(l.netWt - l.bags * l.kgPerBag) > 0.01)
      issues.push(`Lot ${l.invoiceNo}: net wt ${l.netWt} ≠ bags×kg/bag.`);
    // projected proceeds = low-end valuation × net wt
    if (Math.abs(l.projectedProceeds - l.priceMin * l.netWt) > 1)
      issues.push(`Lot ${l.invoiceNo}: projected ${l.projectedProceeds} ≠ priceMin×netWt.`);
  }

  return { docType: "valuation", saleNo, saleDate, lots, issues };
}
