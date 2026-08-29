/**
 * The re-validation gate: our recomputed revenue vs the brokers' own contracts.
 * Run: pnpm --dir packages/api test:validate-revenue
 */
import { validateSaleRevenue, type ContractRevenueDoc } from "./validate-revenue";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);
}

const doc = (id: string, printed: number | null, brokerName = "BPML"): ContractRevenueDoc =>
  ({ id, brokerName, printedNetProceeds: printed });

// ── Nothing confirmed yet is not a failure ──
ok("no confirmed contract → pending, never a mismatch",
  validateSaleRevenue(0, []).status === "pending");
ok("a contract that printed no figure → unavailable, never a mismatch",
  validateSaleRevenue(1_000_000, [doc("a", null)]).status === "unavailable");

// ── Sale 019, the real numbers ──
// BPML 4,448,619.79 + Asia 3,461,553.68 = 7,910,173.47
const sale019 = [doc("bplm", 4_448_619.79), doc("asia", 3_461_553.68, "Asia Siyaka")];

const tallied = validateSaleRevenue(7_910_173.47, sale019);
ok("matching revenue tallies", tallied.status === "tallied", tallied.status);
ok("...and reports both figures and the document count",
  tallied.status === "tallied" && tallied.printed === 7_910_173.47 && tallied.documents === 2);

// The gap the app actually had before the parser fixes.
const off = validateSaleRevenue(7_910_077.19, sale019);
ok("a 96.28 shortfall is caught", off.status === "mismatch", off.status);
ok("...and the difference is signed from OUR side (negative = we are lower)",
  off.status === "mismatch" && off.difference === -96.28, off.status === "mismatch" ? `${off.difference}` : "");

const overstated = validateSaleRevenue(7_910_273.47, sale019);
ok("an overstatement is caught too, with a positive difference",
  overstated.status === "mismatch" && overstated.difference === 100.00,
  overstated.status === "mismatch" ? `${overstated.difference}` : overstated.status);

// ── Rounding across several printed blocks must not cry wolf ──
ok("a two-cent rounding gap still tallies",
  validateSaleRevenue(7_910_173.45, sale019).status === "tallied");
ok("...but six cents does not",
  validateSaleRevenue(7_910_173.41, sale019).status === "mismatch");

// ── Partial ingestion ──
// Only one broker's contract is in: it is checked against that one alone, so a
// half-ingested sale reads as a mismatch rather than silently passing.
const onlyBpml = validateSaleRevenue(4_448_619.79, [doc("bplm", 4_448_619.79)]);
ok("one confirmed contract is checked against itself", onlyBpml.status === "tallied");
ok("...and says so — one document, not two",
  onlyBpml.status === "tallied" && onlyBpml.documents === 1);

// A confirmed contract with no printed figure is ignored, not counted as zero.
const mixed = validateSaleRevenue(4_448_619.79, [doc("bplm", 4_448_619.79), doc("legacy", null)]);
ok("a contract without a printed figure is skipped, not treated as zero",
  mixed.status === "tallied" && mixed.documents === 1,
  mixed.status === "tallied" ? `${mixed.documents}` : mixed.status);

// ── Rung 2: the broker's own insurance figure ─────────────────────────────
// Insurance is the one charge that cannot be recomputed — Asia Siyaka levies
// it on a subset of lots by a rule its contract never states. When swapping in
// the printed figure makes the sale reconcile, every OTHER charge was right,
// and the operator wants a note rather than an alarm.
//
// Real numbers, sale 019: ours 172.02, the contract's 90.42. Insurance sits
// inside the VAT-bearing charges, so the 81.60 gap moves revenue by
// 81.60 × 1.18 = 96.29.
const insuranceDocs: ContractRevenueDoc[] = [
  { id: "bplm", brokerName: "BPML", printedNetProceeds: 4_448_619.79, printedInsurance: null, computedInsurance: null },
  { id: "asia", brokerName: "Asia Siyaka", printedNetProceeds: 3_461_553.68, printedInsurance: 90.42, computedInsurance: 172.02 },
];
const vat = { chargesVatPct: 18 };

const viaInsurance = validateSaleRevenue(7_910_077.19, insuranceDocs, vat);
ok("a gap explained entirely by insurance is not reported as a mismatch",
  viaInsurance.status === "tallied-on-printed-insurance", viaInsurance.status);
ok("...and it names both figures and the difference",
  viaInsurance.status === "tallied-on-printed-insurance"
    && viaInsurance.computedInsurance === 172.02
    && viaInsurance.printedInsurance === 90.42
    && viaInsurance.insuranceDifference === 81.60);

// Only the documents that printed a figure take part. Summing Asia's printed
// insurance against BOTH brokers' computed insurance compares a part with the
// whole, and the sale then fails to reconcile — this was a real bug.
ok("only documents that printed an insurance figure are compared",
  validateSaleRevenue(7_910_077.19, [
    ...insuranceDocs.slice(0, 1),
    { ...insuranceDocs[1], computedInsurance: 172.02 + 145.20 }, // BPML's rolled in
  ], vat).status === "mismatch");

// Rung 1 still wins when it can: an exact sale never mentions insurance.
ok("an exact sale tallies outright, not via insurance",
  validateSaleRevenue(7_910_173.47, insuranceDocs, vat).status === "tallied");

// A gap insurance cannot explain stays a mismatch.
ok("a gap larger than the insurance difference is still a mismatch",
  validateSaleRevenue(7_800_000, insuranceDocs, vat).status === "mismatch");
ok("without the VAT context the fallback is not attempted",
  validateSaleRevenue(7_910_077.19, insuranceDocs).status === "mismatch");
ok("a contract with no printed insurance cannot reach rung 2",
  validateSaleRevenue(7_910_077.19, [insuranceDocs[0]], vat).status === "mismatch");

console.log(failures === 0 ? "\nREVENUE RE-VALIDATION: ALL CHECKS PASSED" : `\nREVENUE RE-VALIDATION: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
