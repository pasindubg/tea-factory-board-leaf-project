/**
 * Parser regression sweep over EVERY real broker document we hold.
 *
 * This exists because of a specific failure: BPML prints a re-printed invoice
 * as "R0032", the catalogued-row pattern accepted digits only, and the row was
 * dropped in silence. It had been happening across six documents. Nothing
 * failed — the app just quietly held less tea than the broker did.
 *
 * So the rule this file enforces is not "the parser works on the one document
 * someone remembered to add a fixture for". It is:
 *
 *   every document we have, routed by the same detector the app uses,
 *   parses with ZERO self-check issues.
 *
 * The self-checks are the broker's own printed totals — lot counts, catalogued
 * kg, bags×kg/bag. A dropped or misread row moves one of them, so a silent
 * parser regression cannot survive this sweep.
 *
 * Corpus is committed text extracted by scripts/build-corpus.mts, using the
 * same unpdf call the server uses, so parsing here means parsing in the app.
 * Add documents with: pnpm --dir packages/api corpus:build "<folder>"
 *
 * Run: pnpm --dir packages/api test:corpus
 */
import { readFileSync, readdirSync } from "node:fs";
import { isAcknowledgement, parseAcknowledgement } from "./parse-acknowledgement";
import { isValuation, parseValuation } from "./parse-valuation";
import { isContract, parseContract } from "./parse-contract";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);
}

/**
 * Σ (Net Proceeds + Total Deductions) over a contract's printed settlement
 * blocks — i.e. the proceeds the broker actually settled on.
 *
 * BOTH layouts, deliberately. This check first covered only Asia Siyaka, and
 * BPML promptly lost a row worth LKR 405,880 on sale 028 without the sweep
 * noticing. A cross-check that covers one broker is an invitation for the
 * other to drift.
 */
function printedProceeds(text: string): number | null {
  const num = (s: string) => Number(s.replace(/,/g, ""));

  // Asia: total net proceeds, NET PROCEEDS, spacer, TOTAL DEDUCTIONS — printed
  // immediately after the Insurance Cover label, once per block.
  const ASIA = /Insurance Cover @ Rs\. [\d.]+ Per kg\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/g;
  const asia = [...text.matchAll(ASIA)];
  if (asia.length > 0) return asia.reduce((total, m) => total + num(m[2]) + num(m[4]), 0);

  // BPML: a run of nine amounts closing each block — brokerage, handling,
  // TOTAL DEDUCTIONS, e-platform, public sale ex., govt relief loan,
  // NET PROCEEDS, output VAT, total net proceeds.
  const BPML = /([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+VAT\s*[\d.]+\s*% on 1,2,3,4,5/g;
  const bpml = [...text.matchAll(BPML)];
  if (bpml.length > 0) return bpml.reduce((total, m) => total + num(m[7]) + num(m[3]), 0);

  return null;
}

const dir = new URL("./__corpus__/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".txt")).sort();

ok("corpus is present", files.length > 0, `${files.length} document(s)`);

const counts = { acknowledgement: 0, valuation: 0, contract: 0, unrouted: 0 };

for (const file of files) {
  const text = readFileSync(new URL(file, dir), "utf8");

  // Routing is part of what regresses: a document the detector stops
  // recognising is as broken as one that parses wrongly, and is easier to miss.
  if (isAcknowledgement(text)) {
    counts.acknowledgement += 1;
    const p = parseAcknowledgement(text);
    ok(`${file}: acknowledgement parses clean`, p.issues.length === 0, p.issues.join(" | "));
    ok(`${file}: has lots`, p.lots.length > 0, `lots=${p.lots.length}`);
    // A sale number only when the layout actually prints one. Asia Siyaka does
    // not, and inventing one from stray digits gave seven documents the same
    // wrong sale — so null is required there, not merely tolerated.
    const printsSaleNo = /Sale No\.:/.test(text);
    ok(`${file}: sale no is read only when the document prints one`,
      printsSaleNo ? Boolean(p.saleNo) : p.saleNo === null,
      `prints=${printsSaleNo} saleNo=${p.saleNo}`);
    // Counts are the whole point: the R0032 row vanished without moving
    // anything else, and only the printed total noticed.
    ok(`${file}: catalogued count matches the printed total`,
      p.lots.filter((l) => l.section === "catalogued").length === p.printedCounts.catalogued,
      `parsed=${p.lots.filter((l) => l.section === "catalogued").length} printed=${p.printedCounts.catalogued}`);
    ok(`${file}: shutout count matches the printed total`,
      p.lots.filter((l) => l.section === "shutout").length === p.printedCounts.shutout,
      `parsed=${p.lots.filter((l) => l.section === "shutout").length} printed=${p.printedCounts.shutout}`);
    // An invoice number that kept a broker's marker would never match our own.
    ok(`${file}: invoice numbers are bare sequences`,
      p.lots.every((l) => /^\d+$/.test(l.invoiceNo)),
      p.lots.filter((l) => !/^\d+$/.test(l.invoiceNo)).map((l) => l.invoiceNo).join(",") || "all numeric");
    continue;
  }

  if (isValuation(text)) {
    counts.valuation += 1;
    const p = parseValuation(text);
    ok(`${file}: valuation parses clean`, p.issues.length === 0, p.issues.join(" | "));
    ok(`${file}: has lots`, p.lots.length > 0, `lots=${p.lots.length}`);
    continue;
  }

  if (isContract(text)) {
    counts.contract += 1;
    const p = parseContract(text);
    ok(`${file}: contract parses clean`, p.issues.length === 0, p.issues.join(" | "));
    ok(`${file}: has lines`, p.lines.length > 0, `lines=${p.lines.length}`);
    // The check that was missing, and that let ten Asia contracts silently
    // lose rows — up to LKR 1,802,000 of proceeds on one document. Every
    // settlement block prints its own Net Proceeds and Total Deductions;
    // their sum is the proceeds the broker settled, so it must equal ours.
    // A dropped row takes its money with it and moves this total.
    const printed = printedProceeds(text);
    if (printed !== null) {
      const parsed = p.lines.filter((l) => l.sold).reduce((a, l) => a + l.proceeds, 0);
      ok(`${file}: parsed proceeds match the printed settlement blocks`,
        Math.abs(parsed - printed) < 0.02,
        `parsed=${parsed.toFixed(2)} printed=${printed.toFixed(2)} diff=${(parsed - printed).toFixed(2)}`);
    }
    // Every contract must yield a printed net proceeds figure — it is what the
    // sale's revenue is re-validated against, and a layout change that stopped
    // producing it would silently disable that check rather than fail it.
    ok(`${file}: printed net proceeds were read for re-validation`,
      p.printedNetProceeds !== null && p.printedNetProceeds > 0,
      `${p.printedNetProceeds}`);
    continue;
  }

  counts.unrouted += 1;
  ok(`${file}: routed to a parser`, false, "no detector claimed this document");
}

console.log(
  `\ncorpus: ${files.length} document(s) — ` +
  `${counts.acknowledgement} acknowledgement, ${counts.valuation} valuation, ` +
  `${counts.contract} contract, ${counts.unrouted} unrouted`,
);
console.log(failures === 0 ? "CORPUS SWEEP: ALL CHECKS PASSED" : `CORPUS SWEEP: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
