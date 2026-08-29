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
  dispatchDate: string | null; // dd/mm/yyyy as printed on the acknowledgement row
  lotNo: string | null; // null in the shutout section (no catalogue no. assigned)
  invoiceNo: string;
  grade: string;
  bags: number;
  kgPerBag: number;
  netWt: number;
  shutoutReason: string | null; // null in the catalogued section
  reprint: boolean; // the broker flagged the row as a re-print (R)
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

// BPML prefixes a re-printed invoice with "R" ("R0032") — the same marker Asia
// Siyaka prints as a flag. Without the optional R the row simply failed to
// match and was dropped in silence, which is what the printed-total self-check
// below exists to catch.
const CATALOGUED_ROW =
  /(\d{3,4})\s+(R?\d{3,4})\s+([A-Z][A-Z0-9]*)\s+(\d+)B\s+([\d.]+)\s+([\d,]+\.\d{2})(?:\s+\S+\s+(\d{2}\/\d{2}\/\d{4}))?/g;
const SHUTOUT_ROW =
  /(R?\d{3,4})\s+([A-Z][A-Z0-9]*)\s+(\d+)B\s+([\d.]+)\s+([\d,]+\.\d{2})(?:\s+\S+\s+(\d{2}\/\d{2}\/\d{4}))?/g;

/** "R0032" → { invoiceNo: "0032", reprint: true }; "0032" → reprint false. */
function splitReprintMarker(raw: string): { invoiceNo: string; reprint: boolean } {
  return raw.startsWith("R")
    ? { invoiceNo: raw.slice(1), reprint: true }
    : { invoiceNo: raw, reprint: false };
}
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
      const { invoiceNo, reprint } = splitReprintMarker(r[2]);
      lots.push({
        section: "catalogued",
        markCode: mark.code,
        markName: mark.name,
        dispatchDate: r[7] ?? null,
        lotNo: r[1],
        invoiceNo,
        grade: r[3],
        bags: Number(r[4]),
        kgPerBag: num(r[5]),
        netWt: num(r[6]),
        shutoutReason: null,
        reprint,
      });
    }
    for (const r of shutoutPart.matchAll(SHUTOUT_ROW)) {
      const { invoiceNo, reprint } = splitReprintMarker(r[1]);
      lots.push({
        section: "shutout",
        markCode: mark.code,
        markName: mark.name,
        dispatchDate: r[6] ?? null,
        lotNo: null,
        invoiceNo,
        grade: r[2],
        bags: Number(r[3]),
        kgPerBag: num(r[4]),
        netWt: num(r[5]),
        shutoutReason: "Listed under Shutout/Violation in the acknowledgement",
        reprint,
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
    // A re-print's weight is already net of the sample drawn when it was first
    // offered, so it is legitimately below bags×kg/bag. Same exemption the Asia
    // Siyaka layout documents for its own re-print rows.
    if (l.reprint) continue;
    if (Math.abs(l.netWt - l.bags * l.kgPerBag) > 0.01)
      issues.push(`Lot ${l.invoiceNo}: net wt ${l.netWt} ≠ bags×kg/bag (${l.bags}×${l.kgPerBag}).`);
  }

  return { docType: "acknowledgement", saleNo, saleDate, lots, printedCounts, issues };
}

// ─── Asia Siyaka variant ────────────────────────────────────────────────────
// One merged line per lot (no per-mark section headers, no MF mark codes):
//   [S|V] {ReceivedDate}{[R]MARK} {Inv#} {Grade} {Chs} {kg/chest} {TotalWt} {MfdDate} {DaysHeld} {Last4Avg}{LotNo}
//   30/04/2026KUMUDU 0951 BOP1 10 30.00 300 23/04/2026 27 1,850.00B0877
//   S 07/04/2026RKUMUDU 0901 DUST1 10 50.00 496 06/04/2026 50 0.00B
// S/V (held back) stand alone in the LotNo column and leave the lot number as a
// bare letter prefix; R is glued to the mark name and means re-print. TotalWt may
// be below chs×kg (sample already deducted), so the bags×kg self-check does not
// apply here. Sale no. is the number after the ACKNOWLEDGEMENT title; sale date
// is the first day of the "SALE OF a - b" range.
const ASIA_ROW =
  /(?:([SV])\s+)?(\d{2}\/\d{2}\/\d{4})([A-Z]+)\s+(\d{1,4})\s+([A-Z][A-Za-z0-9]*)\s+(\d+)\s+([\d.]+)\s+([\d,]+(?:\.\d+)?)\s+\d{2}\/\d{2}\/\d{4}\s+\d+\s+[\d,]+\.\d{2}([A-Z]\d*)/g;

const ASIA_FLAG_REASON: Record<string, string> = {
  S: "Shutout (S) in the acknowledgement",
  V: "Violation (V) in the acknowledgement",
};

function parseAsiaSiyakaAcknowledgement(text: string): ParsedAcknowledgement {
  // An Asia Siyaka acknowledgement does NOT print its sale number — only the
  // date range ("SALE OF 21/07/2026 - 22/07/2026"). Reading the digits after
  // the title returned whatever the extractor had reflowed to there: "27" in
  // seven unrelated documents, because it is a Days Held value from a lot row.
  //
  // Null is the honest answer. The sale a document belongs to is the one it was
  // uploaded against, which is what confirmAcknowledgement already stamps lots
  // with — the display now takes the same view instead of showing this.
  const saleNo = null;
  const saleDate = text.match(/SALE OF\s+(\d{2}\/\d{2}\/\d{4})/i)?.[1] ?? null;

  const raw = [...text.matchAll(ASIA_ROW)].map((r) => ({
    heldBackFlag: r[1] ?? null,
    markToken: r[3],
    dispatchDate: r[2],
    invoiceNo: r[4],
    grade: r[5],
    bags: Number(r[6]),
    kgPerBag: num(r[7]),
    netWt: num(r[8]),
    lotNo: /\d/.test(r[9]) ? r[9] : null,
  }));

  // A leading S/V/R is a flag only when the remainder also appears as a plain
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
    const heldBackFlag = r.heldBackFlag ?? (flag === "S" || flag === "V" ? flag : null);
    return {
      section: heldBackFlag ? "shutout" : "catalogued",
      markCode: mark, // the document only prints the mark NAME — resolved by code OR name downstream
      markName: mark,
      dispatchDate: r.dispatchDate,
      lotNo: r.lotNo,
      invoiceNo: r.invoiceNo,
      grade: r.grade,
      bags: r.bags,
      kgPerBag: r.kgPerBag,
      netWt: r.netWt,
      shutoutReason: heldBackFlag ? ASIA_FLAG_REASON[heldBackFlag] : null,
      reprint: flag === "R",
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
