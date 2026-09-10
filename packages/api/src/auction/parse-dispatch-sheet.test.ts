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

// The book is a working spreadsheet: a revision put a numbering column in front
// of everything and a "Reprint" column in the middle. Columns are found by
// their heading, so neither shifts what is read, and the heading row is found
// wherever it sits.
const rearranged = parseDispatchSheet([
  ["Dispatch Schedule — April 2026"],
  ["#", "Mark", "Dispatch Date", "Broker", "Invoice No.", "Bags", "Weight / Bag", "Grade", "Reprint", "Check"],
  ["1", "Kumudu", "46119", "A/S", "901.0", "10", "50", "PEKOE", "Reprint", "OK"],
]);
const rearrangedRow = rearranged.rows[0];
ok("columns are read by their heading, not their position",
  rearranged.rows.length === 1 &&
    rearrangedRow.sheetRow === 3 &&
    rearrangedRow.invoiceNo === "901" &&
    rearrangedRow.markCode === "MF1530" &&
    rearrangedRow.brokerName === "ASIA SIYAKA" &&
    rearrangedRow.dispatchDate === "2026-04-07",
  JSON.stringify(rearrangedRow ?? rearranged.skipped));

const WORKBOOK = "/Users/pasindu/Desktop/Dispatch new  100% 10 .xlsx";
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
// columns after them shift left, which silently reads the wrong field — sheet
// row 9 (invoice 901) has two of them immediately before the sale numbers.
const row9 = sheet.rows[8];
ok("empty self-closing cells do not shift later columns",
  row9[11] === null && row9[12] === null && row9[13] === "24.0" && row9[14] === "Reprint",
  JSON.stringify(row9.slice(10, 16)));

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
ok("dispatch dates land in the book's year, not a shifted column",
  dates.every((date) => date >= "2026-01-01" && date <= "2026-12-31"),
  `${dates[0]} -> ${dates[dates.length - 1]}`);

// ---------- The book's "Reprint" flag is NOT imported ----------
//
// A re-print is a relationship between two sales that the later sale's
// acknowledgement evidences. The book declares it; this import does not carry
// that declaration, so every row it produces is an ordinary dispatched lot and
// a row the book never dispatched is skipped like any other dateless row.

ok("every importable row is a dispatched lot",
  parsed.rows.every((row) => Boolean(row.dispatchDate)));

// Invoice 909 is flagged "Reprint" in the book and carries no dispatch date —
// it was never dispatched from here, so it is not part of this book's history.
ok("invoice 909 is skipped, not carried in as a re-print",
  !parsed.rows.some((row) => row.invoiceNo === "909") &&
    parsed.skipped.some((row) => row.invoiceNo === "909" && row.reason.includes("dispatch date")),
  parsed.skipped.find((row) => row.invoiceNo === "909")?.reason ?? "not skipped");

// Rows 42/43 (invoices 14 and 15) are flagged "Reprint" AND dispatched. They
// must come through as ordinary lots in the sale the book dispatched them to.
const dispatchedFlags = parsed.rows.filter((row) => ["14", "15"].includes(row.invoiceNo));
ok("a dispatched row flagged \"Reprint\" is still an ordinary lot",
  dispatchedFlags.length === 2 && dispatchedFlags.every((row) => row.saleNo === "20"),
  dispatchedFlags.map((r) => `${r.invoiceNo}@${r.dispatchDate} sale ${r.saleNo}`).join(", "));

// ---------- Skips are categorised, not silent ----------

const buyerReturns = parsed.skipped.filter((row) => /buyer return/i.test(row.reason));
ok("buyer-return notes are skipped as such", buyerReturns.length > 0, `${buyerReturns.length} rows`);

console.log(`\n  importable ${parsed.rows.length}   skipped ${parsed.skipped.length}`);
console.log(`  grade spellings (${parsed.gradeSpellings.length}): ${parsed.gradeSpellings.join(", ")}`);

console.log(failures === 0 ? "\nDISPATCH SHEET: ALL CHECKS PASSED" : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
