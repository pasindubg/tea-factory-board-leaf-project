// M6 verification gate: hand-calculated payment fixture, to the cent.
// Run: pnpm --dir packages/api test:payments
import { computeStatement, type CalcInput } from "./calculate";

let failures = 0;
function expect(label: string, actual: number, expected: number) {
  const ok = Math.abs(actual - expected) < 0.005;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${actual.toFixed(2)} (expected ${expected.toFixed(2)})`);
  if (!ok) failures++;
}

// Scenario (June 2026), hand-calculated:
//   Base GREEN_LEAF rate: 200.00 from 06-01, 210.00 from 06-16 (mid-month change)
//   Tiers: Standard(flat 0, rank 0), Superleaf(flat 35, rank 10), Premium(percent 10, rank 20)
//   Supplier tier: Standard until 06-15, Superleaf from 06-16 (mid-month change)
//   Weighings: 100 kg on 06-10 (rate 200, Standard); 50 kg on 06-20 (rate 210, Superleaf)
//   Deductions: transport 5.00/kg, advance 1000, water 10% of gross, other (sacks) 200
//
//   leaf  = 100×200 + 50×210            = 20000 + 10500 = 30500.00
//   bonus = 100×0   + 50×35             =     0 +  1750 =  1750.00
//   gross                                               = 32250.00
//   bonusMissed: top=Premium(10% of base)
//     wk1: best 100×(200×.10)=2000 vs earned 0     → 2000
//     wk2: best  50×(210×.10)=1050 vs earned 1750  →    0
//                                                   = 2000.00
//   transport 150×5 = 750; advance 1000; water .10×32250 = 3225; other 200
//   deductions                                         =  5175.00
//   net = 32250 − 5175                                  = 27075.00
const fixture: CalcInput = {
  weighings: [
    { weightKg: 100, collectedAt: "2026-06-10T08:00:00Z" },
    { weightKg: 50, collectedAt: "2026-06-20T08:00:00Z" },
  ],
  baseRates: [
    { pricePerKg: 200, effectiveFrom: "2026-06-01", effectiveTo: "2026-06-15" },
    { pricePerKg: 210, effectiveFrom: "2026-06-16", effectiveTo: null },
  ],
  tiers: [
    { id: "std", name: "Standard", bonusKind: "flat", bonusValue: 0, sortOrder: 0 },
    { id: "super", name: "Superleaf", bonusKind: "flat", bonusValue: 35, sortOrder: 10 },
    { id: "prem", name: "Premium", bonusKind: "percent", bonusValue: 10, sortOrder: 20 },
  ],
  assignments: [
    { tierId: "std", effectiveFrom: "2026-06-01", effectiveTo: "2026-06-15" },
    { tierId: "super", effectiveFrom: "2026-06-16", effectiveTo: null },
  ],
  adjustments: [
    { kind: "advance", label: "Advance", amount: 1000, percent: null },
    { kind: "water_penalty", label: "Water (wet leaf)", amount: null, percent: 10 },
    { kind: "other", label: "Sacks", amount: 200, percent: null },
  ],
  transportPerKg: 5,
};

const s = computeStatement(fixture);
console.log("Statement lines:");
for (const l of s.lines) console.log(`  ${l.lineType.padEnd(14)} ${(l.label ?? "").padEnd(22)} ${l.amount.toFixed(2)}`);

expect("totalKg", s.totalKg, 150);
expect("leaf+bonus (gross)", s.grossAmount, 32250);
expect("bonusAmount", s.bonusAmount, 1750);
expect("bonusMissed", s.bonusMissed, 2000);
expect("deductionAmount", s.deductionAmount, 5175);
expect("netAmount", s.netAmount, 27075);
// Lines must reconcile to net exactly.
const lineSum = Math.round(s.lines.reduce((a, l) => a + l.amount, 0) * 100) / 100;
expect("lines sum == net", lineSum, 27075);

// Percent-bonus tier path: 100 kg at rate 200, supplier on Premium (10%) → bonus 2000.
const pct = computeStatement({
  weighings: [{ weightKg: 100, collectedAt: "2026-06-10T08:00:00Z" }],
  baseRates: [{ pricePerKg: 200, effectiveFrom: "2026-06-01", effectiveTo: null }],
  tiers: fixture.tiers,
  assignments: [{ tierId: "prem", effectiveFrom: "2026-06-01", effectiveTo: null }],
  adjustments: [],
  transportPerKg: 0,
});
expect("percent-bonus gross", pct.grossAmount, 22000);
expect("percent-bonus bonusMissed", pct.bonusMissed, 0);

console.log(failures === 0 ? "\nPayment calc: ALL CHECKS PASSED" : `\nPayment calc: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
