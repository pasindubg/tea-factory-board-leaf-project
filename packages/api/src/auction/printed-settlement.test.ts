/**
 * What a sellers contract PRINTS as its net proceeds — the figure the whole
 * revenue re-validation is measured against.
 *
 * Every case below is a real bug this reader had. Read against the committed
 * corpus, so the assertions are the brokers' own documents, not fixtures
 * someone invented.
 *
 * Run: pnpm --dir packages/api test:printed-settlement
 */
import { readFileSync } from "node:fs";
import { parseContract } from "./parse-contract";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);
}
const load = (name: string) =>
  parseContract(readFileSync(new URL(`./__corpus__/${name}.txt`, import.meta.url), "utf8"));

// ── Both layouts must yield a figure ──────────────────────────────────────
// If either stops, the app stores nothing and the re-validation goes silently
// dark — the failure mode the whole feature exists to prevent.
const bpml = load("w-sellers-contracts-bplm-mf1530-blsc019");
const asia = load("w-sellers-contracts-asia-siyaka-mf1530-assc019");
ok("BPML prints a net proceeds figure", bpml.printedNetProceeds === 4_448_619.79, `${bpml.printedNetProceeds}`);
// Summed across blocks in floating point, so compared to the cent rather than
// bit-for-bit.
ok("Asia prints a net proceeds figure",
  Math.abs((asia.printedNetProceeds ?? 0) - 3_461_553.68) < 0.005, `${asia.printedNetProceeds}`);
ok("sale 019 totals what the operator's own spreadsheet totals",
  Number(((bpml.printedNetProceeds ?? 0) + (asia.printedNetProceeds ?? 0)).toFixed(2)) === 7_910_173.47,
  `${(bpml.printedNetProceeds ?? 0) + (asia.printedNetProceeds ?? 0)}`);

// ── A charge-only block for unsold tea is NEGATIVE ────────────────────────
// Asia issues an extra block carrying only the charges levied on tea that did
// not sell: no proceeds, so net proceeds are negative.
//
//     -2,569.73  2,569.73  0.00  2,569.73
//
// The amounts were matched without a sign, so the block was skipped entirely
// and the printed total came out short by exactly that amount. On screen the
// app then looked like it was UNDER-reporting revenue, when the reference
// figure was the thing that was wrong.
const withNegative: [string, number, number][] = [
  ["assc020", 5_040_266.71 - 3_248_365.76, 2_569.73],
  ["assc021", 1_427_778.44, 2_234.11],
  ["assc024", 2_265_676.35, 1_164.61],
];
for (const [sale, , negative] of withNegative) {
  const p = load(`w-sellers-contracts-asia-siyaka-mf1530-${sale}`);
  const naive = /Insurance Cover @ Rs\. [\d.]+ Per kg\s+-?[\d,]+\.\d{2}\s+(-?[\d,]+\.\d{2})/g;
  const allBlocks = [...readFileSync(new URL(`./__corpus__/w-sellers-contracts-asia-siyaka-mf1530-${sale}.txt`, import.meta.url), "utf8").matchAll(naive)];
  ok(`${sale}: the negative block is not skipped`, allBlocks.length >= 2, `${allBlocks.length} blocks`);
  // Summing the blocks naively (all positive) would overstate by 2 × the
  // charge-only block. The signed reading is lower by exactly that much.
  const naiveSum = allBlocks.reduce((a, m) => a + Number(m[1].replace(/,/g, "")), 0);
  ok(`${sale}: the charge-only block is subtracted, not added`,
    Math.abs(naiveSum - (p.printedNetProceeds ?? 0) - 2 * negative) < 0.02,
    `naive ${naiveSum.toFixed(2)} vs signed ${(p.printedNetProceeds ?? 0).toFixed(2)}`);
}

// ── Rate-agnostic anchors ─────────────────────────────────────────────────
// Both readers locate their block by a label containing a rate. Those rates
// must be matched as NUMBERS: a VAT or insurance change would otherwise stop
// the reader finding anything, and the check would disappear rather than fail.
const bpmlText = readFileSync(new URL("./__corpus__/w-sellers-contracts-bplm-mf1530-blsc019.txt", import.meta.url), "utf8");
const asiaText = readFileSync(new URL("./__corpus__/w-sellers-contracts-asia-siyaka-mf1530-assc019.txt", import.meta.url), "utf8");
ok("a VAT rate change does not blind the BPML reader",
  parseContract(bpmlText.replace(/VAT 18% on 1,2,3,4,5/g, "VAT 15% on 1,2,3,4,5")).printedNetProceeds === bpml.printedNetProceeds);
ok("an insurance rate change does not blind the Asia reader",
  parseContract(asiaText.replace(/Insurance Cover @ Rs\. 0\.060 Per kg/g, "Insurance Cover @ Rs. 0.075 Per kg")).printedNetProceeds === asia.printedNetProceeds);

// ── Every contract in the corpus yields a figure ──────────────────────────
import { readdirSync } from "node:fs";
const dir = new URL("./__corpus__/", import.meta.url);
const contracts = readdirSync(dir).filter((f) => f.includes("contract") && f.endsWith(".txt"));
const withoutFigure = contracts.filter((f) => load(f.replace(/\.txt$/, "")).printedNetProceeds === null);
ok("every contract in the corpus prints a readable net proceeds",
  withoutFigure.length === 0, withoutFigure.join(", ") || `${contracts.length} contracts`);

console.log(failures === 0 ? "\nPRINTED SETTLEMENT: ALL CHECKS PASSED" : `\nPRINTED SETTLEMENT: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
