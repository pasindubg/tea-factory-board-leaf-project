// Pure parser for a broker Acknowledgement (text already extracted from the PDF
// by the caller — see apps/web ingestion). Produces the catalogued/shutout lots
// keyed by invoice no + net weight, the inputs to reconciliation ① (docs/AUCTION.md
// §4①, §6).
//
// The extracted text is a flat token stream. Each lot row's LEADING fields are
// clean while trailing date/price columns are mashed and unneeded here:
//   catalogued:  LotNo  Inv#  Grade  <bags>B  kg/bag  NetWt  <junk...>
//   shutout:            Inv#  Grade  <bags>B  kg/bag  NetWt  <junk...>   (no LotNo)
// Sections are bounded by "Catalogued" / "Shutout/Violation" markers, and each
// estate-mark block by a "MFxxxx NAME Catalogued" header.

export type AckSection = "catalogued" | "shutout";

export type AckLot = {
  section: AckSection;
  markCode: string;
  markName: string;
  lotNo: string | null; // null in the shutout section (no catalogue no. assigned)
  invoiceNo: string;
  grade: string;
  bags: number;
  kgPerBag: number;
  netWt: number;
};

export type ParsedAcknowledgement = {
  docType: "acknowledgement";
  saleNo: string | null;
  saleDate: string | null; // dd/mm/yyyy as printed
  lots: AckLot[];
  printedCounts: { catalogued: number; shutout: number };
  issues: string[]; // self-check findings (parsed vs printed, internal consistency)
};

const num = (s: string) => Number(s.replace(/,/g, ""));

const CATALOGUED_ROW = /(\d{3,4})\s+(\d{3,4})\s+([A-Z][A-Z0-9]*)\s+(\d+)B\s+([\d.]+)\s+([\d,]+\.\d{2})/g;
const SHUTOUT_ROW = /(\d{3,4})\s+([A-Z][A-Z0-9]*)\s+(\d+)B\s+([\d.]+)\s+([\d,]+\.\d{2})/g;
const MARK_HEADER = /(MF\d+[A-Z]?)\s+([A-Z][A-Z ]*?)\s+Catalogued/g;

/** Cheap content-based type detection for the ingestion router. */
export function isAcknowledgement(text: string): boolean {
  // BPML layout: "Acknowledgement … Tot.No. Of Lots Catalogued".
  if (/\bAcknowledgement\b/i.test(text) && /Tot\.No\. Of Lots Catalogued/.test(text)) return true;
  // Asia Siyaka layout: "ACKNOWLEDGEMENT <saleNo> We give details of Teas in our catalogue…".
  return /ACKNOWLEDGEMENT/i.test(text) && /We give details of Teas in our catalogue/i.test(text);
}

export function parseAcknowledgement(rawText: string): ParsedAcknowledgement {
  const text = rawText.replace(/\s+/g, " ").trim();
  if (!/Tot\.No\. Of Lots Catalogued/.test(text) && /We give details of Teas in our catalogue/i.test(text)) {
    return parseAsiaSiyakaAcknowledgement(text);
  }
  const saleNo = text.match(/Sale No\.:\s*(\S+)/)?.[1] ?? null;
  const saleDate = text.match(/Sale of\s+(\d{2}\/\d{2}\/\d{4})/)?.[1] ?? null;

  const marks = [...text.matchAll(MARK_HEADER)].map((m) => ({
    code: m[1],
    name: m[2].trim(),
    start: m.index ?? 0,
  }));

  const lots: AckLot[] = [];
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i];
    const chunk = text.slice(mark.start, marks[i + 1]?.start ?? text.length);
    const splitIdx = chunk.search(/Shutout\/Violation For Sale/);
    const cataloguedPart = splitIdx >= 0 ? chunk.slice(0, splitIdx) : chunk;
    const shutoutPart = splitIdx >= 0 ? chunk.slice(splitIdx) : "";

    for (const r of cataloguedPart.matchAll(CATALOGUED_ROW)) {
      lots.push({
        section: "catalogued",
        markCode: mark.code,
        markName: mark.name,
        lotNo: r[1],
        invoiceNo: r[2],
        grade: r[3],
        bags: Number(r[4]),
        kgPerBag: num(r[5]),
        netWt: num(r[6]),
      });
    }
    for (const r of shutoutPart.matchAll(SHUTOUT_ROW)) {
      lots.push({
        section: "shutout",
        markCode: mark.code,
        markName: mark.name,
        lotNo: null,
        invoiceNo: r[1],
        grade: r[2],
        bags: Number(r[3]),
        kgPerBag: num(r[4]),
        netWt: num(r[5]),
      });
    }
  }

  // Printed totals (summed across marks) for the self-check.
  const printedCounts = {
    catalogued: [...text.matchAll(/Tot\.No\. Of Lots Catalogued\s+(\d+)/g)].reduce((s, m) => s + Number(m[1]), 0),
    shutout: [...text.matchAll(/Tot\.No\. Of Lots\s+Shutout\/Violation\s+(\d+)/g)].reduce((s, m) => s + Number(m[1]), 0),
  };

  const parsedCatalogued = lots.filter((l) => l.section === "catalogued").length;
  const parsedShutout = lots.filter((l) => l.section === "shutout").length;
  const issues: string[] = [];
  if (lots.length === 0) issues.push("No lots could be parsed from this document.");
  if (parsedCatalogued !== printedCounts.catalogued)
    issues.push(`Catalogued lots parsed (${parsedCatalogued}) ≠ printed total (${printedCounts.catalogued}).`);
  if (parsedShutout !== printedCounts.shutout)
    issues.push(`Shutout lots parsed (${parsedShutout}) ≠ printed total (${printedCounts.shutout}).`);
  for (const l of lots) {
    if (Math.abs(l.netWt - l.bags * l.kgPerBag) > 0.01)
      issues.push(`Lot ${l.invoiceNo}: net wt ${l.netWt} ≠ bags×kg/bag (${l.bags}×${l.kgPerBag}).`);
  }

  return { docType: "acknowledgement", saleNo, saleDate, lots, printedCounts, issues };
}

// ─── Asia Siyaka variant ────────────────────────────────────────────────────
// One merged line per lot (no per-mark section headers, no MF mark codes):
//   {ReceivedDate}{[flag]MARK} {Inv#} {Grade} {Chs} {kg/chest} {TotalWt} {MfdDate} {DaysHeld} {Last4Avg}{LotNo}
//   30/04/2026KUMUDU 0951 BOP1 10 30.00 300 23/04/2026 27 1,850.00B0877
// The mark is its NAME (e.g. KUMUDU), optionally prefixed by a flag letter glued
// on (S=Shutout, V=Violation per the legend; R=re-print). Lot numbers carry a
// letter prefix (B0877). TotalWt may be below chs×kg (sample already deducted),
// so the bags×kg self-check does not apply here. Sale no. is the number after
// the ACKNOWLEDGEMENT title; sale date is the first day of the "SALE OF a - b" range.
const ASIA_ROW =
  /(\d{2}\/\d{2}\/\d{4})([A-Z]+)\s+(\d{1,4})\s+([A-Z][A-Z0-9]*)\s+(\d+)\s+([\d.]+)\s+([\d,]+(?:\.\d+)?)\s+\d{2}\/\d{2}\/\d{4}\s+\d+\s+[\d,]+\.\d{2}([A-Z]\d+)/g;

function parseAsiaSiyakaAcknowledgement(text: string): ParsedAcknowledgement {
  const saleNo = text.match(/ACKNOWLEDGEMENT\s+(\d{1,4})\b/i)?.[1] ?? null;
  const saleDate = text.match(/SALE OF\s+(\d{2}\/\d{2}\/\d{4})/i)?.[1] ?? null;

  const raw = [...text.matchAll(ASIA_ROW)].map((r) => ({
    markToken: r[2],
    invoiceNo: r[3],
    grade: r[4],
    bags: Number(r[5]),
    kgPerBag: num(r[6]),
    netWt: num(r[7]),
    lotNo: r[8],
  }));

  // Flag letters are glued onto the mark name (RKUMUDU = flagged KUMUDU). A
  // leading S/V/R is a flag only when the remainder also appears as a plain
  // mark token elsewhere in the document.
  const plainTokens = new Set(raw.map((r) => r.markToken));
  const splitMark = (token: string): { mark: string; flag: string | null } => {
    const head = token[0];
    const rest = token.slice(1);
    if ("SVR".includes(head) && rest.length >= 2 && plainTokens.has(rest)) return { mark: rest, flag: head };
    return { mark: token, flag: null };
  };

  const lots: AckLot[] = raw.map((r) => {
    const { mark, flag } = splitMark(r.markToken);
    return {
      section: flag === "S" || flag === "V" ? "shutout" : "catalogued",
      markCode: mark, // the document only prints the mark NAME — resolved by code OR name downstream
      markName: mark,
      lotNo: r.lotNo,
      invoiceNo: r.invoiceNo,
      grade: r.grade,
      bags: r.bags,
      kgPerBag: r.kgPerBag,
      netWt: r.netWt,
    };
  });

  const parsedCatalogued = lots.filter((l) => l.section === "catalogued").length;
  const parsedShutout = lots.filter((l) => l.section === "shutout").length;
  const issues: string[] = [];
  if (lots.length === 0) issues.push("No lots could be parsed from this document.");
  // Self-check: the grand-total block prints main/off-grade/total catalogued kg.
  const grand = text.match(/Cataloged Qty\b[^\d]*([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/);
  if (grand) {
    const printedKg = num(grand[3]);
    const parsedKg = lots.filter((l) => l.section === "catalogued").reduce((s, l) => s + l.netWt, 0);
    if (Math.abs(printedKg - parsedKg) > 0.01)
      issues.push(`Catalogued kg parsed (${parsedKg.toFixed(2)}) ≠ printed total (${printedKg.toFixed(2)}).`);
  }

  return {
    docType: "acknowledgement",
    saleNo,
    saleDate,
    lots,
    // This layout prints kg totals, not lot counts — mirror the parsed counts
    // so the count-based self-checks stay silent.
    printedCounts: { catalogued: parsedCatalogued, shutout: parsedShutout },
    issues,
  };
}
