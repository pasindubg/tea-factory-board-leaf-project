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

export const VALUATION_PROCEEDS_TOLERANCE = 1;

export type ValuationProceedsValidation = {
  rows: {
    invoiceNo: string;
    lotNo: string;
    expectedProceeds: number;
    reportedProceeds: number;
    variance: number;
    tallies: boolean;
  }[];
  summary: {
    expectedTotal: number;
    reportedTotal: number;
    variance: number;
    tallyingLots: number;
    nonTallyingLots: number;
    tallies: boolean;
  };
};

export type ParsedValuation = {
  docType: "valuation";
  saleNo: string | null;
  saleDate: string | null; // dd/mm/yyyy (sale day)
  lots: ValuationLot[];
  issues: string[];
};

const num = (s: string) => Number(s.replace(/,/g, ""));
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * A broker valuation is internally consistent when its reported proceeds are
 * the lower-end valuation per kg multiplied by the document net weight. This
 * calculation applies to both the BPML and Asia Siyaka layouts.
 */
export function validateValuationProceeds(lots: readonly ValuationLot[]): ValuationProceedsValidation {
  const rows = lots.map((lot) => {
    const expectedProceeds = money(lot.netWt * lot.priceMin);
    const reportedProceeds = money(lot.projectedProceeds);
    const variance = money(reportedProceeds - expectedProceeds);
    return {
      invoiceNo: lot.invoiceNo,
      lotNo: lot.lotNo,
      expectedProceeds,
      reportedProceeds,
      variance,
      tallies: Math.abs(variance) <= VALUATION_PROCEEDS_TOLERANCE,
    };
  });
  const expectedTotal = money(rows.reduce((sum, row) => sum + row.expectedProceeds, 0));
  const reportedTotal = money(rows.reduce((sum, row) => sum + row.reportedProceeds, 0));
  const variance = money(reportedTotal - expectedTotal);
  const nonTallyingLots = rows.filter((row) => !row.tallies).length;
  return {
    rows,
    summary: {
      expectedTotal,
      reportedTotal,
      variance,
      tallyingLots: rows.length - nonTallyingLots,
      nonTallyingLots,
      tallies: Math.abs(variance) <= VALUATION_PROCEEDS_TOLERANCE && nonTallyingLots === 0,
    },
  };
}

function proceedsIssues(lots: readonly ValuationLot[]) {
  return validateValuationProceeds(lots).rows
    .filter((row) => !row.tallies)
    .map((row) => `Lot ${row.invoiceNo}: reported ${row.reportedProceeds} ≠ lower valuation×net wt (${row.expectedProceeds}).`);
}

const MARK_HEADER = /(MF\d+[A-Z]?)\s+([A-Z][A-Z ]*?)\s+Valuation Report/g;
const ROW =
  /(\d{3,4})\s+(\d{3,4})\s+([A-Z][A-Z0-9]*)\s+(\d+)\s*B\s*@\s*(\d+)\s+([\d.]+)\s+([\d,]+(?:-[\d,]+)?)\s*\/=\s+([\d,]+\.\d{2})\s+(.*?)(?=\s+\d{3,4}\s+\d{3,4}\s+[A-Z][A-Z0-9]*\s+\d+\s*B|\s+Dear Sir|\s+LIQUORS|$)/g;

const ASIA_MARK_HEADER = /(MF\d+[A-Z]?)\s+([A-Z][A-Z ]*?)(?=\s+\d{3,4}\s+\d{3,4}\s+[A-Z][A-Z0-9]*\s+[\d,.]+\s+[\d,.]+\s*\d)/g;
const ASIA_ROW =
  /(\d{3,4})\s+(\d{3,4})\s+([A-Z][A-Z0-9]*)\s+([\d,.]+)\s+([\d,]+\.\d{2})\s*(\d[\d,]*(?:\s*-\s*\d[\d,]*)?)\s+([\d,]+\.\d{2})(?=\s|$)/g;

const formatFourDigits = (value: string) => value.padStart(4, "0");

function parseAsiaSiyaka(text: string): ParsedValuation {
  const saleNo = text.match(/Sale No\s+(\d{1,3})/i)?.[1]?.padStart(3, "0") ?? null;
  const date = text.match(/Sale of\s*:\s*(\d{1,2})-([A-Z][a-z]{2})-(\d{4})/i);
  const month = date
    ? String(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(date[2].toLowerCase()) + 1).padStart(2, "0")
    : null;
  const saleDate = date && month !== "00" ? `${date[1].padStart(2, "0")}/${month}/${date[3]}` : null;
  const marks = [...text.matchAll(ASIA_MARK_HEADER)].map((m) => ({
    code: m[1],
    name: m[2].trim(),
    start: m.index ?? 0,
  }));

  const lots: ValuationLot[] = [];
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i];
    const chunk = text.slice(mark.start, marks[i + 1]?.start ?? text.length);
    for (const row of chunk.matchAll(ASIA_ROW)) {
      const [min, max] = row[6].replace(/\s+/g, "").split("-");
      lots.push({
        markCode: mark.code,
        markName: mark.name,
        lotNo: formatFourDigits(row[1]),
        invoiceNo: formatFourDigits(row[2]),
        grade: row[3],
        bags: 0,
        kgPerBag: 0,
        netWt: num(row[4]),
        priceMin: num(min),
        priceMax: num(max ?? min),
        projectedProceeds: num(row[7]),
        tastingNote: "",
      });
    }
  }

  const issues: string[] = [];
  if (lots.length === 0) issues.push("No ASIA SIYAKA valuation rows could be parsed.");
  issues.push(...proceedsIssues(lots));
  return { docType: "valuation", saleNo, saleDate, lots, issues };
}

export function isValuation(text: string): boolean {
  return (
    (/Valuation Report/i.test(text) && /PROJECTED\s+PROCEEDS|DESCRIPTION OF DRY LEAF/i.test(text)) ||
    (/Asia Siyaka Commodities PLC/i.test(text) && /VALUATION\s*&\s*MUSTER REPORT/i.test(text) && /Value Per Kg/i.test(text))
  );
}

export function parseValuation(rawText: string): ParsedValuation {
  const text = rawText.replace(/\s+/g, " ").trim();
  if (/Asia Siyaka Commodities PLC/i.test(text) && /VALUATION\s*&\s*MUSTER REPORT/i.test(text)) {
    return parseAsiaSiyaka(text);
  }
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
  }
  issues.push(...proceedsIssues(lots));

  return { docType: "valuation", saleNo, saleDate, lots, issues };
}
