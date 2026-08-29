// Pure parser for the Tea Sellers Contract & Account Sales (text already extracted
// from the PDF). Each line:
//   <Buyer> <LotNo> <InvNo> <Grade> "<N> Bags" <Gross> <S/Allw> <Net> <Price>
//   <Proceeds> <VAT> <Proceeds+VAT><buyerVatNo> <YES|NO>
// The buyer VAT no is mashed onto the end of Proceeds+VAT; the buyer NAME precedes
// the lot and is bounded on the left by the "Bank Guarantee" header label. A1's
// deduction stack (insurance, brokerage, …) is deferred to A3. Feeds recon ② / ③.

import { parseContractRates, type ContractRates } from "./parse-contract-rates";

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
  /**
   * The broker's deduction rate card as this contract states it. The contract
   * is the source of truth for what the broker charges, so these drive the
   * settlement rates and are compared against the stored card on review.
   */
  rates: ContractRates;
  /**
   * Σ of the Net Proceeds the contract PRINTS in its settlement blocks, or
   * null for a layout that states none.
   *
   * This is the broker's own answer, read rather than recomputed, and it is
   * what the app's total revenue is checked against once every contract for a
   * sale is confirmed. Both brokers split a contract into several blocks — per
   * page, per mark — so it is a sum, not a single figure.
   *
   * It exists because a silently dropped sale row moves this total and nothing
   * else: ten Asia contracts lost rows worth up to LKR 1,802,000 apiece, and
   * the recomputed settlement simply followed them down.
   */
  printedNetProceeds: number | null;
  /**
   * Σ of the Insurance Cover the contract PRINTS, or null when the layout does
   * not state it per block.
   *
   * Insurance is the one charge that cannot be recomputed. Asia Siyaka levies
   * it on a SUBSET of the lots by a rule the contract never states — on sale
   * 019 it insured 1,507 kg of 1,867 and charged nothing at all on two of the
   * three blocks, while sale 025 came out at exactly 0.060/kg throughout.
   * Whole lots are excluded, so it is not rounding.
   *
   * The settlement therefore computes insurance as normal and only falls back
   * to this when the computed total refuses to tally — see validateSaleRevenue.
   */
  printedInsurance: number | null;
  issues: string[];
};

const money = (s: string) => Number(s.replace(/,/g, ""));

/**
 * BPML prints each block's totals as a run of amounts ending
 * "<net> <output VAT> <total net proceeds> VAT 18% on 1,2,3,4,5".
 *
 * The VAT percentage in that anchor is matched as a NUMBER, not the literal
 * 18: a rate change would otherwise stop this reading anything, the app would
 * store no printed figure, and the re-validation would quietly go dark — the
 * exact silent failure this whole check exists to prevent.
 */
function bpmlPrintedNetProceeds(text: string): number | null {
  const BLOCK = /(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s+VAT\s*[\d.]+\s*% on 1,2,3,4,5/g;
  const blocks = [...text.matchAll(BLOCK)];
  // Signs matter here too: a charge-only block for unsold tea is negative.
  return blocks.length === 0 ? null : blocks.reduce((sum, m) => sum + signedNet(money(m[3]), money(m[1])), 0);
}

/**
 * Asia Siyaka prints the same four figures right after its Insurance Cover
 * label: total net proceeds, net proceeds, a spacer, total deductions.
 *
 * A sale with unsold tea gets an extra CHARGE-ONLY block — no proceeds, only
 * the handling/insurance/public-sale charges the broker still levies — so its
 * net proceeds are NEGATIVE:
 *
 *   -2,569.73  2,569.73  0.00  2,569.73
 *
 * Two things went wrong here before. The amounts were matched without a sign,
 * so the whole block was skipped and the printed total came out short by
 * exactly that amount — which then showed on screen as the app under-reporting
 * revenue. And the extractor attaches the minus to the first figure only, so
 * the sign is taken from there: total net proceeds is net proceeds plus output
 * VAT, and VAT is never negative, so a negative total means a negative net.
 */
function asiaPrintedNetProceeds(text: string): number | null {
  const BLOCK = /Insurance Cover @ Rs\. [\d.]+ Per kg\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})/g;
  const blocks = [...text.matchAll(BLOCK)];
  return blocks.length === 0 ? null : blocks.reduce((sum, m) => sum + signedNet(money(m[1]), money(m[2])), 0);
}

/** Net proceeds, taking its sign from the total-net-proceeds column. */
function signedNet(totalNetProceeds: number, netProceeds: number): number {
  return totalNetProceeds < 0 ? -Math.abs(netProceeds) : netProceeds;
}

/**
 * Σ Insurance Cover across Asia Siyaka's printed charge runs, which close with
 * "… Document": output VAT, INSURANCE, public sale ex., brokerage, handling,
 * charges VAT, e-platform.
 *
 * BPML needs no equivalent — its computed insurance already reconciles to the
 * cent on every contract we hold, so there is nothing to read.
 */
function asiaPrintedInsurance(text: string): number | null {
  const RUN = /([\d,]+\.\d{2}) ([\d,]+\.\d{2}) ([\d,]+\.\d{2}) ([\d,]+\.\d{2}) ([\d,]+\.\d{2}) ([\d,]+\.\d{2}) ([\d,]+\.\d{2}) Document/g;
  const runs = [...text.matchAll(RUN)];
  return runs.length === 0 ? null : runs.reduce((sum, m) => sum + money(m[2]), 0);
}

const num = (s: string) => Number(s.replace(/,/g, ""));

// Contract no. is year/sale-no/counter, e.g. 2026/021/098 or 2026/021/0145 —
// none of the three segments is a fixed-width field, only the "/" delimiters
// are guaranteed. The counter alone is known to vary (3 digits early in a
// season, 4+ once it rolls over), so every segment is left unbounded (\d+);
// the "/" separators plus the "TEA SELLERS CONTRACT" anchor keep this from
// over-matching unrelated digits.
const HEADER =
  /(\d+\/\d+\/\d+)\s+TEA SELLERS CONTRACT[\s\S]*?AUCTION SALE\s+(MF\d+[A-Z]?)\s*\|\s*([A-Z]+)/g;
// BPML sold rows end with a buyer VAT number; NOT SOLD rows leave that column
// blank. The optional VAT group is what lets both row types participate in the
// same ordered scan, so a skipped NOT SOLD row cannot leak into the next buyer.
//
// The re-print marker from the C/R column lands in EITHER of two places, and a
// row carrying it in the unhandled one was dropped in silence:
//
//   NOT SOLD, no VAT number:  "… 0.00R NO"                  → glued to the amount
//   SOLD, with a VAT number:  "… 478,938.40104063209-7000 R NO"  → after the VAT
//
// Dropping a row is worse than losing its money: the buyer and the NOT SOLD
// label are read from the gap since the PREVIOUS match, so the label slides
// onto the following lot. Both `R?` are non-capturing — the group numbers
// below are positional.
const BPML_ROW =
  /(\d{3,4})\s+(\d{3,4})\s+([A-Z][A-Z0-9]*)\s+(\d+)\s+Bags\s+([\d,]+\.\d{2})\s+([\d.]+)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})R?(?:(\d{9}-\d{4}))?\s*(?:R\s*)?(YES|NO)/g;
const NOT_SOLD_LABEL = /\*{3}\s*N O T S O L D\s*\*{3}/;

const ASIA_HEADER =
  /(\d+\/\d+\/\d+)\s+Miriswatte,?-?\s*Ittapana\.\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})(MF\d+[A-Z]?)\s*\|\s*([A-Z]+)/g;
// Grades are MIXED CASE: "FBOPFExSp", "FBOPFSp", "BOPSp" — Sp for Special, Ex
// for Extra. An uppercase-only grade class silently dropped every row carrying
// one, and a dropped row takes its proceeds with it: on sale 025 that was
// LKR 1,802,000 of tea missing from the settlement. The acknowledgement parser
// was corrected for the same thing; this one was not.
const ASIA_SOLD_ROW =
  /([\d,]+\.\d{2})([\d,]+\.\d{2})(\d{9}-\d{4})\s+([\d,]+\.\d{2})([\d.]+)([A-Z][A-Za-z0-9]*?)(\d{4})(\d{4})\s*([A-Z][^\d\s].*?)\s+([\d,]+\.\d{2})([\d,]+\.\d{2})([\d.]+)\s+([\d,]+\.\d{2})\s+(YES|NO)/g;
const ASIA_NOT_SOLD_ROW =
  /(0\.00)(0\.00)(0\.00)([\d.]+)([A-Z][A-Za-z0-9]*?)(\d{4})(\d{4})\*{3}\s*N O T S O L D\s*\*{3}\s*(0\.00)([\d,]+\.\d{2})([\d.]+)\s+([\d,]+\.\d{2})\s+(YES|NO)/g;

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
  // A multi-page contract repeats its header per page; keep the first.
  const contracts = [...new Map(headers.map((h) => [h.contractNo, h])).values()].map(
    ({ contractNo, markCode, markName }) => ({ contractNo, markCode, markName }),
  );
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

  const asiaRates = parseContractRates(text);
  const issues = validateContractLines(lines, "No ASIA SIYAKA contract lines could be parsed.", asiaRates.proceedsVatPct);
  return {
    docType: "contract",
    saleNo,
    saleDate: headers[0]?.saleDate ?? null,
    promptDate: headers[0]?.promptDate ?? null,
    contracts,
    lines,
    rates: asiaRates,
    printedNetProceeds: asiaPrintedNetProceeds(text),
    printedInsurance: asiaPrintedInsurance(text),
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

  const bpmlRates = parseContractRates(text);
  const issues = validateContractLines(lines, "No contract lines could be parsed.", bpmlRates.proceedsVatPct);

  return { docType: "contract", saleNo, saleDate, promptDate, contracts, lines, rates: bpmlRates, printedNetProceeds: bpmlPrintedNetProceeds(text), printedInsurance: null, issues };
}

function validateContractLines(lines: ContractLine[], emptyMessage: string, proceedsVatPct?: number | null): string[] {
  const issues: string[] = [];
  if (lines.length === 0) issues.push(emptyMessage);
  for (const l of lines) {
    const validation = validateContractLine(l, proceedsVatPct);
    if (!validation.netWeightMatches)
      issues.push(`Lot ${l.invoiceNo}: net ≠ gross − sample allowance.`);
    if (!validation.proceedsMatch)
      issues.push(`Lot ${l.invoiceNo}: proceeds ≠ net × price/kg.`);
    if (!validation.vatMatches)
      issues.push(`Lot ${l.invoiceNo}: VAT ≠ ${proceedsVatPct}% of proceeds.`);
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
/**
 * `proceedsVatPct` comes from the contract being validated — the document
 * states its own rate, and every contract we hold does.
 *
 * It used to be the literal 0.18. A VAT change would then have flagged EVERY
 * line of every contract as a VAT mismatch, burying the real issues in noise.
 * When no rate is known the VAT check is skipped rather than guessed: an
 * unanswerable question is not a failed one.
 */
export function validateContractLine(line: ContractLine, proceedsVatPct?: number | null): ContractLineValidation {
  const expectedNetWt = Number((line.grossWt - line.sampleAllowance).toFixed(2));
  const expectedProceeds = Number((line.netWt * line.pricePerKg).toFixed(2));
  const proceedsVariance = Number((line.proceeds - expectedProceeds).toFixed(2));
  return {
    expectedNetWt,
    expectedProceeds,
    proceedsVariance,
    netWeightMatches: Math.abs(line.netWt - expectedNetWt) <= 0.01,
    proceedsMatch: Math.abs(proceedsVariance) <= 0.5,
    vatMatches: proceedsVatPct == null
      ? true
      : Math.abs(line.vatAmount - line.proceeds * proceedsVatPct / 100) <= 0.5,
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
