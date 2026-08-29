/**
 * END-TO-END: every sale we hold contracts for must reconcile against the
 * brokers' own printed net proceeds.
 *
 * Parser → settlement engine → re-validation, on all 28 real contracts. Unit
 * tests pin each piece; this pins the ANSWER. Every bug that reached the
 * operator today would have failed here:
 *
 *   dropped rows        — the "R" re-print marker, in both brokers' layouts
 *   wrong charge basis  — handling/insurance/public-sale-ex on all lots, not sold
 *   an unread block     — Asia's negative charge-only block for unsold tea
 *
 * Any of those moves a sale off its printed total, so none can return quietly.
 *
 * Run: pnpm --dir packages/api test:settlement-balance
 */
import { readFileSync, readdirSync } from "node:fs";
import { parseContract } from "./parse-contract";
import { computeSettlement } from "./compute-settlement";
import { validateSaleRevenue, type ContractRevenueDoc } from "./validate-revenue";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);
}

const dir = new URL("./__corpus__/", import.meta.url);
const bySale = new Map<string, { computed: number; docs: ContractRevenueDoc[] }>();

for (const f of readdirSync(dir).filter((x) => x.includes("contract") && x.endsWith(".txt")).sort()) {
  const p = parseContract(readFileSync(new URL(f, dir), "utf8"));
  const sale = String(p.saleNo).replace(/^\d{4}-/, "");
  let computed = 0;
  let insurance = 0;
  for (const c of [...new Map(p.contracts.map((x) => [x.contractNo, x])).values()]) {
    const sold = p.lines.filter((l) => l.sold && l.contractNo === c.contractNo);
    const all = p.lines.filter((l) => l.contractNo === c.contractNo);
    // Same aggregates confirmAcknowledgement builds: sold drives brokerage,
    // documentation and e-platform; every lot drives handling, insurance and
    // public sale expenses.
    const r = computeSettlement({ ...p.rates, govtReliefLoan: 0 } as never, {
      contractNo: c.contractNo,
      netKg: sold.reduce((a, l) => a + l.netWt, 0),
      handlingKg: all.reduce((a, l) => a + l.netWt, 0),
      lotCount: sold.length,
      chargedLots: all.length,
      proceedsTotal: sold.reduce((a, l) => a + l.proceeds, 0),
    });
    computed += r.netProceeds;
    insurance += r.insurance;
  }
  const acc = bySale.get(sale) ?? { computed: 0, docs: [] };
  acc.computed += computed;
  acc.docs.push({
    id: f,
    brokerName: f.includes("bplm") ? "BPML" : "Asia Siyaka",
    printedNetProceeds: p.printedNetProceeds,
    printedInsurance: p.printedInsurance,
    computedInsurance: insurance,
  });
  bySale.set(sale, acc);
}

ok("every sale in the corpus has contracts from both brokers",
  [...bySale.values()].every((v) => v.docs.length === 2),
  [...bySale].filter(([, v]) => v.docs.length !== 2).map(([s]) => s).join(",") || `${bySale.size} sales`);

let outright = 0;
let viaInsurance = 0;
for (const [sale, v] of [...bySale].sort()) {
  const r = validateSaleRevenue(v.computed, v.docs, { chargesVatPct: 18 });
  if (r.status === "tallied") outright++;
  if (r.status === "tallied-on-printed-insurance") viaInsurance++;
  ok(`sale ${sale} reconciles with the brokers' contracts`,
    r.status === "tallied" || r.status === "tallied-on-printed-insurance",
    r.status === "mismatch"
      ? `off by ${r.difference.toFixed(2)} (ours ${r.computed.toFixed(2)} vs contracts ${r.printed.toFixed(2)})`
      : r.status);
}

// The insurance fallback is a documented exception, not a dragnet. If it
// starts absorbing sales it was not absorbing, a real error is hiding in it.
ok("only the two known insurance sales use the fallback", viaInsurance === 2, `${viaInsurance}`);
ok("every other sale tallies outright", outright === bySale.size - 2, `${outright} of ${bySale.size}`);

console.log(failures === 0
  ? `\nSETTLEMENT BALANCE: ALL ${bySale.size} SALES RECONCILE (${outright} outright, ${viaInsurance} on printed insurance)`
  : `\nSETTLEMENT BALANCE: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
