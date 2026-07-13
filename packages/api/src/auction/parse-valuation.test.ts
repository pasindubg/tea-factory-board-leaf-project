// A2 verification gate: parse the real Sale-023 Valuation + Sellers Contract and
// reconcile ② (valuation ↔ sale price). Run: pnpm --dir packages/api test:auction2
import { readFileSync } from "node:fs";
import { parseValuation } from "./parse-valuation";
import { parseContract } from "./parse-contract";
import { reconcileValuation, type ValuationInput, type SaleInput } from "./reconcile-valuation";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!cond) failures++;
}
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps;

const valText = readFileSync(new URL("./__fixtures__/val-sale-023.txt", import.meta.url), "utf8");
const conText = readFileSync(new URL("./__fixtures__/contract-sale-023.txt", import.meta.url), "utf8");
const asiaText = readFileSync(new URL("./__fixtures__/val-asia-siyaka-sale-020.txt", import.meta.url), "utf8");
const asiaContractText = readFileSync(new URL("./__fixtures__/contract-asia-siyaka-sale-020.txt", import.meta.url), "utf8");

// ---- Valuation ----
const val = parseValuation(valText);
const v = (inv: string) => val.lots.find((l) => l.invoiceNo === inv);
ok("valuation: sale no 2026-023", val.saleNo === "2026-023", `${val.saleNo}`);
ok("valuation: 12 lots, no issues", val.lots.length === 12 && val.issues.length === 0, val.issues.join(" | "));
ok("val 0058 → point 1600, projected 448000", !!v("0058") && v("0058")!.priceMin === 1600 && v("0058")!.priceMax === 1600 && v("0058")!.projectedProceeds === 448000);
ok("val 0059 → range 1350-1400, projected 324000", !!v("0059") && v("0059")!.priceMin === 1350 && v("0059")!.priceMax === 1400 && v("0059")!.projectedProceeds === 324000);
ok("val 0044 → range 1900-1950 (PEK1)", !!v("0044") && v("0044")!.priceMin === 1900 && v("0044")!.priceMax === 1950 && v("0044")!.grade === "PEK1");
ok("val 0074 → BM 740-760 ITTAPANA", !!v("0074") && v("0074")!.priceMin === 740 && v("0074")!.priceMax === 760 && v("0074")!.markCode === "MF1530A");
ok("val 0480 tasting note captured", (v("0038")?.tastingNote ?? "").includes("Not black enough"));

// ---- ASIA SIYAKA Valuation & Muster Report ----
const asia = parseValuation(asiaText);
const av = (inv: string) => asia.lots.find((l) => l.invoiceNo === inv);
ok("ASIA valuation: sale 020 on 25/05/2026", asia.saleNo === "020" && asia.saleDate === "25/05/2026", `${asia.saleNo} / ${asia.saleDate}`);
ok("ASIA valuation: 6 lots, no issues", asia.lots.length === 6 && asia.issues.length === 0, asia.issues.join(" | "));
ok("ASIA 0012: lot 1263, FBOPF1, 1500-1550", !!av("0012") && av("0012")!.lotNo === "1263" && av("0012")!.grade === "FBOPF1" && av("0012")!.priceMin === 1500 && av("0012")!.priceMax === 1550);
ok("ASIA 0018: BM, 830-850, projected 249000", !!av("0018") && av("0018")!.priceMin === 830 && av("0018")!.priceMax === 850 && av("0018")!.projectedProceeds === 249000);
ok("ASIA 0014: point valuation 780", !!av("0014") && av("0014")!.priceMin === 780 && av("0014")!.priceMax === 780 && av("0014")!.markCode === "MF1530A");

// ---- Contract ----
const con = parseContract(conText);
const c = (inv: string) => con.lines.find((l) => l.invoiceNo === inv);
ok("contract: 12 lines, no issues", con.lines.length === 12 && con.issues.length === 0, con.issues.join(" | "));
ok("contract: prompt date 24/06/2026", con.promptDate === "24/06/2026", `${con.promptDate}`);
ok("contract: two contracts (0110, 0111)", con.contracts.length === 2);
ok("con 0058 → INTER TEA, NO guarantee, proceeds 448000, vat 80640",
  !!c("0058") && c("0058")!.buyerName === "INTER TEA (PVT) LTD." && c("0058")!.onGuarantee === false &&
    c("0058")!.proceeds === 448000 && c("0058")!.vatAmount === 80640 && c("0058")!.buyerVatNo === "114211770-7000");
ok("con 0066 → STASSEN, guarantee YES", !!c("0066") && /STASSEN/.test(c("0066")!.buyerName) && c("0066")!.onGuarantee === true);
ok("con 0065 → EMPIRE, guarantee YES", !!c("0065") && /EMPIRE/.test(c("0065")!.buyerName) && c("0065")!.onGuarantee === true);
ok("con 0074 → SUNSHINE, ITTAPANA contract 0111", !!c("0074") && /SUNSHINE/.test(c("0074")!.buyerName) && c("0074")!.contractNo === "2026/023/0111");
const kumuduProceeds = con.lines.filter((l) => l.markCode === "MF1530").reduce((s, l) => s + l.proceeds, 0);
const ittProceeds = con.lines.filter((l) => l.markCode === "MF1530A").reduce((s, l) => s + l.proceeds, 0);
ok("contract: KUMUDU proceeds 4,920,400 / ITTAPANA 258,000", kumuduProceeds === 4920400 && ittProceeds === 258000, `${kumuduProceeds} / ${ittProceeds}`);

// ---- ASIA SIYAKA Sellers Contract & Account Sales ----
const asiaContract = parseContract(asiaContractText);
const ac = (inv: string) => asiaContract.lines.find((line) => line.invoiceNo === inv);
ok("ASIA contract: sale 020, dates normalized", asiaContract.saleNo === "2026-020" && asiaContract.saleDate === "26/05/2026" && asiaContract.promptDate === "03/06/2026", `${asiaContract.saleNo} / ${asiaContract.saleDate} / ${asiaContract.promptDate}`);
ok("ASIA contract: two contracts, six captured lines, no issues", asiaContract.contracts.length === 2 && asiaContract.lines.length === 6 && asiaContract.issues.length === 0, asiaContract.issues.join(" | "));
ok("ASIA 0012: DAMRO, VAT, weights and proceeds", !!ac("0012") && /DAMRO/.test(ac("0012")!.buyerName) && ac("0012")!.buyerVatNo === "114253871-7000" && ac("0012")!.grossWt === 383.5 && ac("0012")!.sampleAllowance === 3.5 && ac("0012")!.netWt === 380 && ac("0012")!.pricePerKg === 1600 && ac("0012")!.proceeds === 608000 && ac("0012")!.vatAmount === 109440);
ok("ASIA 0018: George Steuart, guarantee NO", !!ac("0018") && /George Steuart/.test(ac("0018")!.buyerName) && ac("0018")!.onGuarantee === false && ac("0018")!.proceedsPlusVat === 311520);
ok("ASIA second-page NOT SOLD rows captured", ac("0014")?.sold === false && ac("0014")?.lotNo === "1690" && ac("0014")?.grade === "BM" && ac("0015")?.sold === false && ac("0015")?.netWt === 250);
const asiaRecon = reconcileValuation(
  asia.lots.map((line) => ({ lotId: line.invoiceNo, invoiceNo: line.invoiceNo, grade: line.grade, netWt: line.netWt, priceMin: line.priceMin, priceMax: line.priceMax, projectedProceeds: line.projectedProceeds })),
  asiaContract.lines.filter((line) => line.sold).map((line) => ({ lotId: line.invoiceNo, pricePerKg: line.pricePerKg, proceeds: line.proceeds })),
);
ok("ASIA valuation vs contract: four sold lots above range", asiaRecon.summary.above === 4 && asiaRecon.summary.within === 0 && asiaRecon.summary.below === 0, JSON.stringify(asiaRecon.summary));

// ---- Reconciliation ② (join valuation ↔ sale by invoice no) ----
const valInputs: ValuationInput[] = val.lots.map((l) => ({
  lotId: l.invoiceNo, invoiceNo: l.invoiceNo, grade: l.grade, netWt: l.netWt,
  priceMin: l.priceMin, priceMax: l.priceMax, projectedProceeds: l.projectedProceeds,
}));
const saleInputs: SaleInput[] = con.lines.map((l) => ({ lotId: l.invoiceNo, pricePerKg: l.pricePerKg, proceeds: l.proceeds }));
const recon = reconcileValuation(valInputs, saleInputs);
ok("recon②: 1 within (0058), 11 above, 0 below, 0 no-valuation",
  recon.summary.within === 1 && recon.summary.above === 11 && recon.summary.below === 0 && recon.summary.noValuation === 0,
  JSON.stringify({ w: recon.summary.within, a: recon.summary.above, b: recon.summary.below }));
ok("recon②: total proceeds 5,178,400 / projected 4,731,500",
  recon.summary.totalProceeds === 5178400 && recon.summary.totalProjected === 4731500,
  `${recon.summary.totalProceeds} / ${recon.summary.totalProjected}`);
const r58 = recon.rows.find((r) => r.invoiceNo === "0058");
ok("recon②: 0058 within, variance 0", !!r58 && r58.classification === "within" && r58.variance === 0);

// KUMUDU-only subset → the headline +9.1% (avg 1,518.35 → 1,656.70)
const kInv = new Set(val.lots.filter((l) => l.markCode === "MF1530").map((l) => l.invoiceNo));
const kRecon = reconcileValuation(valInputs.filter((x) => kInv.has(x.invoiceNo)), saleInputs.filter((x) => kInv.has(x.lotId)));
ok("recon②: KUMUDU valuation avg 1,518.35", near(kRecon.summary.valuationAvg, 1518.35), `${kRecon.summary.valuationAvg}`);
ok("recon②: KUMUDU realised avg 1,656.70", near(kRecon.summary.realisedAvg, 1656.7), `${kRecon.summary.realisedAvg}`);
ok("recon②: KUMUDU premium ≈ +9.1%", near(kRecon.summary.premiumPct, 9.11, 0.05), `${kRecon.summary.premiumPct}%`);

console.log(failures === 0 ? "\nAUCTION VALUATION + CONTRACT + RECON②: ALL CHECKS PASSED" : `\nAUCTION A2: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
