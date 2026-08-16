// Broker rate card read off the real Sellers Contracts, then checked by
// recomputing the contract's OWN printed Account Sales totals from it.
//
// Run: pnpm --dir packages/api test:contract-rates
import { readFileSync } from "node:fs";
import { computeSettlement } from "./compute-settlement";
import { contractRateDifferences, hasContractRates, parseContractRates } from "./parse-contract-rates";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!cond) failures++;
}
const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");
const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const EXPECTED = {
  insurancePerKg: 0.06,
  publicSaleExPerLot: 87.87,
  brokeragePct: 1,
  handlingPerKg: 3.58,
  documentationPerLot: 25,
  eplatformPerKg: 0.25,
  chargesVatPct: 18,
  proceedsVatPct: 18,
};

// ---------- Both brokers print the same card, spaced differently ----------
// BPML writes "Rs.0.06" and "VAT 18%"; ASIA SIYAKA writes "Rs. 0.060" and
// "VAT 18 %". Same rates either way.

for (const [file, broker] of [
  ["contract-charges-bpml-sale-020.txt", "BPML"],
  ["contract-charges-asia-sale-020.txt", "ASIA SIYAKA"],
  ["contract-bpml.txt", "BPML sale 19"],
  ["contract-asia-siyaka.txt", "ASIA SIYAKA sale 19"],
  ["contract-sale-023.txt", "BPML sale 23"],
] as const) {
  const rates = parseContractRates(fixture(file));
  const matches = Object.entries(EXPECTED).every(([key, value]) => rates[key as keyof typeof EXPECTED] === value);
  ok(`${broker.padEnd(20)} rate card parsed`, matches, JSON.stringify(rates));
}

ok("brokerage is the 1.00% the contracts state",
  parseContractRates(fixture("contract-charges-bpml-sale-020.txt")).brokeragePct === 1);

// ---------- The parsed card reproduces the contract's printed totals ----------
//
// SLC-S20-BL prints, for its single sold lot (220 kg, 1 lot, proceeds 246,400):
//   insurance 13.20 · public sale ex 87.87 · brokerage 2,464.00 · handling
//   787.60 · documentation 25.00 · charges VAT 607.99 · e-platform 55.00
//   Total deductions 4,040.66 · Net proceeds 242,359.34
//   VAT on proceeds 44,352.00 · Total net proceeds 286,711.34

const rates = parseContractRates(fixture("contract-charges-bpml-sale-020.txt"));
const settlement = computeSettlement(
  {
    insurancePerKg: rates.insurancePerKg!,
    publicSaleExPerLot: rates.publicSaleExPerLot!,
    brokeragePct: rates.brokeragePct!,
    handlingPerKg: rates.handlingPerKg!,
    documentationPerLot: rates.documentationPerLot!,
    eplatformPerKg: rates.eplatformPerKg!,
    govtReliefLoan: 0,
    chargesVatPct: rates.chargesVatPct!,
    proceedsVatPct: rates.proceedsVatPct!,
  },
  { contractNo: "2026/020/0001", netKg: 220, lotCount: 1, proceedsTotal: 246400 },
);

console.log(`\n  total deductions   ${money(settlement.totalDeductions).padStart(12)}  (contract prints 4,040.66)`);
console.log(`  net proceeds       ${money(settlement.netProceeds).padStart(12)}  (contract prints 242,359.34)`);
console.log(`  VAT on proceeds    ${money(settlement.outputVat).padStart(12)}  (contract prints 44,352.00)`);
console.log(`  total net proceeds ${money(settlement.totalNetProceeds).padStart(12)}  (contract prints 286,711.34)\n`);

const near = (a: number, b: number) => Math.abs(a - b) <= 0.02;
ok("total deductions match the contract", near(settlement.totalDeductions, 4040.66), money(settlement.totalDeductions));
ok("net proceeds match the contract", near(settlement.netProceeds, 242359.34), money(settlement.netProceeds));
ok("VAT on proceeds matches the contract", near(settlement.outputVat, 44352), money(settlement.outputVat));
ok("total net proceeds match the contract", near(settlement.totalNetProceeds, 286711.34), money(settlement.totalNetProceeds));

// ---------- Differences against a stored card ----------

ok("an identical stored card reports no difference",
  contractRateDifferences(rates, { ...EXPECTED }).length === 0);

const drifted = contractRateDifferences(rates, { ...EXPECTED, brokeragePct: 1.5, handlingPerKg: 4 });
ok("a drifted stored card reports exactly the fields that differ",
  drifted.length === 2 && drifted.every((d) => ["brokeragePct", "handlingPerKg"].includes(d.field)),
  drifted.map((d) => `${d.field} ${d.contract} vs ${d.stored}`).join(", "));
ok("the difference names the contract value as authoritative",
  drifted[0]?.contract === 1 && drifted[0]?.stored === 1.5);

ok("a rate absent from the contract is not reported as a difference",
  contractRateDifferences({ ...rates, brokeragePct: null }, { ...EXPECTED, brokeragePct: 99 }).length === 0);
ok("a rate absent from the stored card is not reported as a difference",
  contractRateDifferences(rates, { ...EXPECTED, brokeragePct: null }).length === 0);

// ---------- Contracts with no Account Sales block ----------

const trimmed = parseContractRates(fixture("contract-asia-siyaka-sale-020.txt"));
ok("an excerpt with no charges block yields no rates", !hasContractRates(trimmed));
ok("…and therefore proposes no rate card", Object.values(trimmed).every((v) => v === null));

console.log(failures === 0 ? "\nCONTRACT RATE CARD: ALL CHECKS PASSED" : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
