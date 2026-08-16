// The factory's real Dispatch Schedule workbook, April–July 2026.
//
// Run: pnpm --dir packages/api test:dispatch-sheet
//      (skips itself if the workbook is not on this machine)
import { existsSync, readFileSync } from "node:fs";
import { readSheet, excelSerialToISODate } from "./read-xlsx";
import { parseDispatchSheet, DISPATCH_SHEET_NAME, normalizeBrokerName, normalizeMarkCode } from "./parse-dispatch-sheet";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!cond) failures++;
}

// ---------- Unit checks that never need the workbook ----------

ok("Excel serial 46119 is 2026-04-07", excelSerialToISODate("46119.0") === "2026-04-07", String(excelSerialToISODate("46119.0")));
ok("a blank serial is not a date", excelSerialToISODate("") === null);
ok("a nonsense serial is not a date", excelSerialToISODate("banana") === null);
ok("broker initials resolve", normalizeBrokerName("A/S") === "ASIA SIYAKA" && normalizeBrokerName("B/L") === "BPML");
ok("an unknown broker is left alone", normalizeBrokerName("FORBES") === "FORBES");
ok("mark names resolve to codes", normalizeMarkCode("Kumudu") === "MF1530" && normalizeMarkCode("Ittapana") === "MF1530A");

ok("a grid that is not this sheet is refused",
  parseDispatchSheet([["Name", "Address"], ["x", "y"]]).issues.length > 0);

const WORKBOOK = "/Users/pasindu/Desktop/invoices/sale 19/Dispatch new  100% 10 .xlsx";
if (!existsSync(WORKBOOK)) {
  console.log(`\nSKIP  workbook not present at ${WORKBOOK}`);
  process.exit(failures === 0 ? 0 : 1);
}

const sheet = readSheet(new Uint8Array(readFileSync(WORKBOOK)), DISPATCH_SHEET_NAME);
if (!sheet.ok) {
  console.log(`FAIL  workbook could not be read — ${sheet.error}`);
  process.exit(1);
}

ok("the workbook's sheets are listed", sheet.sheetNames.includes(DISPATCH_SHEET_NAME), sheet.sheetNames.join(" | "));

// A styled-but-empty cell is written self-closing. If those are mishandled the
// columns after them shift left, which silently reads the wrong field — this
// row has two of them (K2, L2) immediately before the sale numbers.
const row2 = sheet.rows[1];
ok("empty self-closing cells do not shift later columns",
  row2[10] === null && row2[11] === null && row2[12] === "24.0" && row2[13] === "Reprint",
  JSON.stringify(row2.slice(9, 15)));

const parsed = parseDispatchSheet(sheet.rows);
ok("the sheet parses without issues", parsed.issues.length === 0, parsed.issues.join(" | "));
ok("every importable row has bags and kg/bag",
  parsed.rows.every((row) => row.bags > 0 && row.kgPerBag > 0));
ok("every importable row has a broker and mark this factory uses",
  parsed.rows.every((row) => ["ASIA SIYAKA", "BPML"].includes(row.brokerName) && ["MF1530", "MF1530A"].includes(row.markCode)));
ok("nothing is both imported and skipped",
  parsed.rows.every((row) => !parsed.skipped.some((s) => s.sheetRow === row.sheetRow)));
ok("every skipped row says why", parsed.skipped.every((row) => row.reason.length > 0));

const dates = parsed.rows.map((row) => row.dispatchDate).filter((date): date is string => Boolean(date));
ok("dispatch dates span the book's April–July range",
  dates.every((date) => date >= "2026-04-01" && date <= "2026-08-01"),
  `${dates[0]} -> ${dates[dates.length - 1]}`);

// ---------- Re-prints carry BOTH sale numbers ----------

const reprints = parsed.rows.filter((row) => row.isReprint);
ok("the book's re-prints are recognised", reprints.length > 0, `${reprints.length} rows`);

const twoSales = reprints.find((row) => row.saleNo && row.nextSaleNo);
ok("a re-print states the sale it was first offered in AND the sale it moved to",
  Boolean(twoSales), twoSales ? `inv ${twoSales.invoiceNo}: first ${twoSales.saleNo} -> ${twoSales.nextSaleNo}` : "none found");

// Invoice 909 sits at the end of the book with no dispatch date — it was never
// dispatched from here. It must still come through, as a cutover re-print.
const legacy = parsed.rows.find((row) => row.invoiceNo === "909");
ok("invoice 909 is kept even though the book gives it no dispatch date",
  Boolean(legacy) && legacy!.isReprint && legacy!.dispatchDate === null,
  legacy ? `first sale ${legacy.saleNo}, broker ${legacy.brokerName}, grade ${legacy.grade}` : "missing");

// Only a re-print the book never dispatched is a CUTOVER re-print. The book
// marks both kinds "Reprint"; the dispatch date is what separates them.
const cutover = reprints.filter((row) => row.dispatchDate === null);
const ordinaryReprints = reprints.filter((row) => row.dispatchDate !== null);
ok("exactly one re-print in the book was never dispatched from it",
  cutover.length === 1 && cutover[0].invoiceNo === "909",
  cutover.map((r) => r.invoiceNo).join(", "));
ok("the other re-prints were dispatched and so are ordinary lifecycles",
  ordinaryReprints.length > 0 && ordinaryReprints.every((row) => Boolean(row.dispatchDate)),
  ordinaryReprints.map((r) => `${r.invoiceNo}@${r.dispatchDate}`).join(", "));

ok("an ORDINARY row with no dispatch date is still skipped",
  parsed.skipped.some((row) => row.reason.includes("dispatch date")) || parsed.rows.every((r) => r.dispatchDate || r.isReprint));

// ---------- Skips are categorised, not silent ----------

const buyerReturns = parsed.skipped.filter((row) => /buyer return/i.test(row.reason));
ok("buyer-return notes are skipped as such", buyerReturns.length > 0, `${buyerReturns.length} rows`);

console.log(`\n  importable ${parsed.rows.length}   skipped ${parsed.skipped.length}   re-prints ${reprints.length}`);
console.log(`  grade spellings (${parsed.gradeSpellings.length}): ${parsed.gradeSpellings.join(", ")}`);

console.log(failures === 0 ? "\nDISPATCH SHEET: ALL CHECKS PASSED" : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
