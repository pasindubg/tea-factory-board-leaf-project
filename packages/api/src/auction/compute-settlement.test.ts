// A3 verification gate: settlement math against Sale 023 golden numbers
// (docs/AUCTION.md §7). Run: pnpm --dir packages/api test:settlement
import { computeSettlement } from "./compute-settlement";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(cond ? `PASS ` : `FAIL `, label, detail ? `— ${detail}` : "");
  if (!cond) failures++;
}

const BPML = {
  insurancePerKg: 0.06, publicSaleExPerLot: 87.87, brokeragePct: 1.00,
  handlingPerKg: 3.58, documentationPerLot: 25.00, eplatformPerKg: 0.25,
  govtReliefLoan: 0, chargesVatPct: 18.00, proceedsVatPct: 18.00,
};

// ── Sale 023 KUMUDU (0110) ──
const k = computeSettlement(BPML, { contractNo: "2026/023/0110", netKg: 2970, lotCount: 11, proceedsTotal: 4920400 });
ok("KUMUDU insurance", k.insurance === 178.20);
ok("KUMUDU public sale ex", k.publicSaleEx === 966.57);
ok("KUMUDU brokerage", k.brokerage === 49204.00);
ok("KUMUDU handling", k.handling === 10632.60);
ok("KUMUDU documentation", k.documentation === 275.00);
ok("KUMUDU charges subtotal", k.chargesSubtotal === 61256.37);
ok("KUMUDU charges VAT", k.chargesVat === 11026.15);
ok("KUMUDU e-platform", k.eplatform === 742.50);
ok("KUMUDU total deductions", k.totalDeductions === 73025.02, `got ${k.totalDeductions}`);
ok("KUMUDU net proceeds", k.netProceeds === 4847374.98, `got ${k.netProceeds}`);
ok("KUMUDU output VAT", k.outputVat === 885672.00, `got ${k.outputVat}`);
ok("KUMUDU total net proceeds", k.totalNetProceeds === 5733046.98, `got ${k.totalNetProceeds}`);

// ── Sale 023 ITTAPANA (0111) ──
const t = computeSettlement(BPML, { contractNo: "2026/023/0111", netKg: 300, lotCount: 1, proceedsTotal: 258000 });
ok("ITTAPANA insurance", t.insurance === 18.00);
ok("ITTAPANA brokerage", t.brokerage === 2580.00);
ok("ITTAPANA handling", t.handling === 1074.00);
ok("ITTAPANA total deductions", t.totalDeductions === 4541.15, `got ${t.totalDeductions}`);
ok("ITTAPANA net proceeds", t.netProceeds === 253458.85, `got ${t.netProceeds}`);
ok("ITTAPANA output VAT", t.outputVat === 46440.00);
ok("ITTAPANA total net proceeds", t.totalNetProceeds === 299898.85, `got ${t.totalNetProceeds}`);

// ── Invariants ──
const c = computeSettlement(BPML, { contractNo: "test", netKg: 100, lotCount: 1, proceedsTotal: 5000 });
ok("invariant: net = proceeds − deductions", Math.abs(c.netProceeds - (c.proceedsTotal - c.totalDeductions)) < 0.01);
ok("invariant: TNP = net + output VAT", Math.abs(c.totalNetProceeds - (c.netProceeds + c.outputVat)) < 0.01);
ok("8 charge lines", c.charges.length === 8);
ok("charges in order", c.charges[0].code === "insurance" && c.charges[7].code === "govt_relief_loan");

console.log(failures === 0 ? "\nSETTLEMENT MATH: ALL CHECKS PASSED" : `\nSETTLEMENT MATH: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
