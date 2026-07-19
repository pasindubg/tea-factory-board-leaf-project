// Pure parser for the Tea Sellers Contract & Account Sales (text already extracted
// from the PDF). Each line:
//   <Buyer> <LotNo> <InvNo> <Grade> "<N> Bags" <Gross> <S/Allw> <Net> <Price>
//   <Proceeds> <VAT> <Proceeds+VAT><buyerVatNo> <YES|NO>
// The buyer VAT no is mashed onto the end of Proceeds+VAT; the buyer NAME precedes
// the lot and is bounded on the left by the "Bank Guarantee" header label. A1's
// deduction stack (insurance, brokerage, …) is deferred to A3. Feeds recon ② / ③.

export type ContractLine = {
  sold: boolean;
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
// BPML sold rows end with a buyer VAT number; NOT SOLD rows leave that column
// blank. The optional VAT group is what lets both row types participate in the
// same ordered scan, so a skipped NOT SOLD row cannot leak into the next buyer.
const BPML_ROW =
  /(\d{3,4})\s+(\d{3,4})\s+([A-Z][A-Z0-9]*)\s+(\d+)\s+Bags\s+([\d,]+\.\d{2})\s+([\d.]+)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})(?:(\d{9}-\d{4}))?\s*(YES|NO)/g;
const NOT_SOLD_LABEL = /\*{3}\s*N O T S O L D\s*\*{3}/;

const ASIA_HEADER =
  /(\d{4}\/\d{3}\/\d{4})\s+Miriswatte,?-?\s*Ittapana\.\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})(MF\d+[A-Z]?)\s*\|\s*([A-Z]+)/g;
const ASIA_SOLD_ROW =
  /([\d,]+\.\d{2})([\d,]+\.\d{2})(\d{9}-\d{4})\s+([\d,]+\.\d{2})([\d.]+)([A-Z][A-Z0-9]*?)(\d{4})(\d{4})([A-Z][A-Za-z].*?)\s+([\d,]+\.\d{2})([\d,]+\.\d{2})([\d.]+)\s+([\d,]+\.\d{2})\s+(YES|NO)/g;
const ASIA_NOT_SOLD_ROW =
  /(0\.00)(0\.00)(0\.00)([\d.]+)([A-Z][A-Z0-9]*?)(\d{4})(\d{4})\*{3}\s*N O T S O L D\s*\*{3}\s*(0\.00)([\d,]+\.\d{2})([\d.]+)\s+([\d,]+\.\d{2})\s+(YES|NO)/g;

const asiaDate = (value: string) => {
  const [month, day, year] = value.split("/");
  return `${day}/${month}/${year}`;
};

function parseAsiaSiyakaContract(text: string): ParsedContract {
  const headers = [...text.matchAll(ASIA_HEADER)].map((match) => ({
    contractNo: match[1],
    saleDate: asiaDate(match[2]),
    promptDate: asiaDate(match[3]),
    markCode: match[4],
    markName: match[5],
    index: match.index ?? 0,
  }));
  const headerAt = (index: number) => {
    let header = headers[0];
    for (const candidate of headers) if (candidate.index <= index) header = candidate;
    return header;
  };
  const contracts = headers.map(({ contractNo, markCode, markName }) => ({ contractNo, markCode, markName }));
  const saleNo = contracts[0] ? contracts[0].contractNo.split("/").slice(0, 2).join("-") : null;

  const lines: ContractLine[] = [];
  for (const row of text.matchAll(ASIA_SOLD_ROW)) {
    const header = headerAt(row.index ?? 0);
    lines.push({
      sold: true,
      contractNo: header?.contractNo ?? "",
      markCode: header?.markCode ?? "",
      markName: header?.markName ?? "",
      buyerName: row[9].replace(/\s+/g, " ").trim(),
      buyerVatNo: row[3],
      lotNo: row[8],
      invoiceNo: row[7],
      grade: row[6],
      bags: num(row[12]),
      grossWt: num(row[11]),
      sampleAllowance: num(row[5]),
      netWt: num(row[13]),
      pricePerKg: num(row[10]),
      proceeds: num(row[4]),
      vatAmount: num(row[2]),
      proceedsPlusVat: num(row[1]),
      onGuarantee: row[14] === "YES",
    });
  }
  for (const row of text.matchAll(ASIA_NOT_SOLD_ROW)) {
    const header = headerAt(row.index ?? 0);
    lines.push({
      sold: false,
      contractNo: header?.contractNo ?? "",
      markCode: header?.markCode ?? "",
      markName: header?.markName ?? "",
      buyerName: "Not sold",
      buyerVatNo: "",
      lotNo: row[7],
      invoiceNo: row[6],
      grade: row[5],
      bags: num(row[10]),
      grossWt: num(row[9]),
      sampleAllowance: num(row[4]),
      netWt: num(row[11]),
      pricePerKg: num(row[8]),
      proceeds: num(row[3]),
      vatAmount: num(row[2]),
      proceedsPlusVat: num(row[1]),
      onGuarantee: row[12] === "YES",
    });
  }
  lines.sort((a, b) => a.contractNo.localeCompare(b.contractNo) || a.invoiceNo.localeCompare(b.invoiceNo));

  const issues = validateContractLines(lines, "No ASIA SIYAKA contract lines could be parsed.");
  return {
    docType: "contract",
    saleNo,
    saleDate: headers[0]?.saleDate ?? null,
    promptDate: headers[0]?.promptDate ?? null,
    contracts,
    lines,
    issues,
  };
}

export function isContract(text: string): boolean {
  return /TEA SELLERS CONTRACT & ACCOUNT SALES/i.test(text);
}

export function parseContract(rawText: string): ParsedContract {
  const text = rawText.replace(/\s+/g, " ").trim();
  if (/Asia Siyaka Commodities PLC/i.test(text)) return parseAsiaSiyakaContract(text);

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
  for (const m of text.matchAll(BPML_ROW)) {
    const start = m.index ?? 0;
    // Buyer name = text since the previous line, after the last "Bank Guarantee" label.
    const gap = text.slice(prevEnd, start);
    const rawBuyer = (gap.split("Bank Guarantee").pop() ?? "").replace(/\s+/g, " ").trim();
    const sold = !NOT_SOLD_LABEL.test(rawBuyer);
    const buyerName = sold ? rawBuyer : "Not sold";
    const h = headerAt(start);
    lines.push({
      sold,
      contractNo: h?.contractNo ?? "",
      markCode: h?.markCode ?? "",
      markName: h?.markName ?? "",
      buyerName,
      buyerVatNo: m[12] ?? "",
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

  const issues = validateContractLines(lines, "No contract lines could be parsed.");

  return { docType: "contract", saleNo, saleDate, promptDate, contracts, lines, issues };
}

function validateContractLines(lines: ContractLine[], emptyMessage: string): string[] {
  const issues: string[] = [];
  if (lines.length === 0) issues.push(emptyMessage);
  for (const l of lines) {
    const validation = validateContractLine(l);
    if (!validation.netWeightMatches)
      issues.push(`Lot ${l.invoiceNo}: net ≠ gross − sample allowance.`);
    if (!validation.proceedsMatch)
      issues.push(`Lot ${l.invoiceNo}: proceeds ≠ net × price/kg.`);
    if (!validation.vatMatches)
      issues.push(`Lot ${l.invoiceNo}: VAT ≠ 18% of proceeds.`);
    if (!validation.proceedsPlusVatMatches)
      issues.push(`Lot ${l.invoiceNo}: proceeds+VAT mismatch.`);
    if (!l.buyerName) issues.push(`Lot ${l.invoiceNo}: buyer name not captured.`);
    if (l.sold && NOT_SOLD_LABEL.test(l.buyerName))
      issues.push(`Lot ${l.invoiceNo}: buyer name contains a NOT SOLD row; re-upload the contract to re-parse it.`);
    if (l.sold && !l.buyerVatNo) issues.push(`Lot ${l.invoiceNo}: buyer VAT number not captured.`);
    if (!l.sold && (l.pricePerKg !== 0 || l.proceeds !== 0 || l.vatAmount !== 0 || l.proceedsPlusVat !== 0))
      issues.push(`Lot ${l.invoiceNo}: NOT SOLD row contains non-zero sale values.`);
  }
  return issues;
}

export type ContractLineValidation = {
  expectedNetWt: number;
  expectedProceeds: number;
  proceedsVariance: number;
  netWeightMatches: boolean;
  proceedsMatch: boolean;
  vatMatches: boolean;
  proceedsPlusVatMatches: boolean;
};

/** Numeric checks shared by parser warnings, confirmation guards and the review list. */
export function validateContractLine(line: ContractLine): ContractLineValidation {
  const expectedNetWt = Number((line.grossWt - line.sampleAllowance).toFixed(2));
  const expectedProceeds = Number((line.netWt * line.pricePerKg).toFixed(2));
  const proceedsVariance = Number((line.proceeds - expectedProceeds).toFixed(2));
  return {
    expectedNetWt,
    expectedProceeds,
    proceedsVariance,
    netWeightMatches: Math.abs(line.netWt - expectedNetWt) <= 0.01,
    proceedsMatch: Math.abs(proceedsVariance) <= 0.5,
    vatMatches: Math.abs(line.vatAmount - line.proceeds * 0.18) <= 0.5,
    proceedsPlusVatMatches: Math.abs(line.proceedsPlusVat - (line.proceeds + line.vatAmount)) <= 0.01,
  };
}

export function contractValidationIssues(lines: ContractLine[]): string[] {
  return validateContractLines(lines, "No contract lines could be parsed.");
}

/**
 * Repairs BPML rows staged by the older parser. That parser skipped a NOT SOLD
 * numeric row and stored its complete text at the front of the following sold
 * buyer name. The skipped row still contains every field needed to reconstruct
 * it, so existing staged imports can be reviewed and confirmed safely without
 * requiring the original PDF bytes.
 */
export function repairLegacyContractLines(lines: ContractLine[]): ContractLine[] {
  return lines.flatMap((line) => {
    if (!line.sold) return [line];
    const marker = line.buyerName.match(NOT_SOLD_LABEL);
    if (!marker || marker.index == null) return [line];

    const afterMarker = line.buyerName.slice(marker.index + marker[0].length).trim();
    const rowMatch = new RegExp(BPML_ROW.source).exec(afterMarker);
    if (!rowMatch || rowMatch.index !== 0) return [line];

    const repairedBuyerName = afterMarker.slice(rowMatch[0].length).trim();
    if (!repairedBuyerName) return [line];

    const notSoldLine: ContractLine = {
      sold: false,
      contractNo: line.contractNo,
      markCode: line.markCode,
      markName: line.markName,
      buyerName: "Not sold",
      buyerVatNo: "",
      lotNo: rowMatch[1],
      invoiceNo: rowMatch[2],
      grade: rowMatch[3],
      bags: Number(rowMatch[4]),
      grossWt: num(rowMatch[5]),
      sampleAllowance: num(rowMatch[6]),
      netWt: num(rowMatch[7]),
      pricePerKg: num(rowMatch[8]),
      proceeds: num(rowMatch[9]),
      vatAmount: num(rowMatch[10]),
      proceedsPlusVat: num(rowMatch[11]),
      onGuarantee: rowMatch[13] === "YES",
    };

    return [notSoldLine, { ...line, buyerName: repairedBuyerName }];
  });
}
