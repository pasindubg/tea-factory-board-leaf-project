// A1 verification gate: parse the real Sale-023 Acknowledgement + reconcile.
// Run: pnpm --dir packages/api test:auction
import { readFileSync } from "node:fs";
import { parseAcknowledgement, type AckLot } from "./parse-acknowledgement";
import { reconcileAcknowledgement, relateAcknowledgementParseWarnings, type InvoicedLot, type ReconRow } from "./reconcile";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!cond) failures++;
}

const text = readFileSync(new URL("./__fixtures__/ack-sale-023.txt", import.meta.url), "utf8");
const ack = parseAcknowledgement(text);
const byInv = (inv: string): AckLot | undefined => ack.lots.find((l) => l.invoiceNo === inv);

// ---- parse ----
ok("sale no", ack.saleNo === "023", `${ack.saleNo}`);
ok("sale date", ack.saleDate === "17/06/2026", `${ack.saleDate}`);
ok("self-check clean", ack.issues.length === 0, ack.issues.join(" | ") || "no issues");
ok("12 catalogued + 2 shutout parsed", ack.lots.length === 14, `${ack.lots.length} lots`);
ok(
  "catalogued/shutout counts",
  ack.lots.filter((l) => l.section === "catalogued").length === 12 &&
    ack.lots.filter((l) => l.section === "shutout").length === 2,
  `${ack.printedCounts.catalogued}/${ack.printedCounts.shutout} printed`,
);

const l58 = byInv("0058");
ok("inv 0058 → lot 0477 OP 280kg KUMUDU catalogued",
  !!l58 && l58.lotNo === "0477" && l58.grade === "OP" && l58.netWt === 280 &&
    l58.markCode === "MF1530" && l58.section === "catalogued" && l58.dispatchDate === "29/05/2026",
  l58 ? `lot=${l58.lotNo} grade=${l58.grade} net=${l58.netWt} mark=${l58.markCode} date=${l58.dispatchDate}` : "missing");

const l74 = byInv("0074");
ok("inv 0074 → lot 1270 BM 300kg ITTAPANA catalogued",
  !!l74 && l74.lotNo === "1270" && l74.grade === "BM" && l74.netWt === 300 &&
    l74.markCode === "MF1530A" && l74.dispatchDate === "26/05/2026",
  l74 ? `lot=${l74.lotNo} grade=${l74.grade} net=${l74.netWt} mark=${l74.markCode} date=${l74.dispatchDate}` : "missing");

const l61 = byInv("0061");
ok("inv 0061 → shutout OPA 200kg (no lot no)",
  !!l61 && l61.section === "shutout" && l61.lotNo === null && l61.netWt === 200 &&
    l61.markCode === "MF1530" && l61.dispatchDate === "29/05/2026",
  l61 ? `section=${l61.section} net=${l61.netWt} date=${l61.dispatchDate}` : "missing");

const l63 = byInv("0063");
ok("inv 0063 → shutout OPA 230kg ITTAPANA",
  !!l63 && l63.section === "shutout" && l63.netWt === 230 && l63.markCode === "MF1530A",
  l63 ? `section=${l63.section} net=${l63.netWt}` : "missing");

// ---- reconcile: clean case (factory invoiced exactly what the ack shows) ----
const invoicedClean: InvoicedLot[] = ack.lots.map((l) => ({
  id: l.invoiceNo,
  invoiceNo: l.invoiceNo,
  grade: l.grade,
  netWt: l.netWt,
}));
const recon = reconcileAcknowledgement(invoicedClean, ack);
ok("clean recon: 12 catalogued, 2 shutout, 0 not-acknowledged",
  recon.summary.catalogued === 12 && recon.summary.shutout === 2 &&
    recon.summary.notAcknowledged === 0 && recon.summary.weightMismatches === 0,
  JSON.stringify(recon.summary));
ok("clean recon: shutout stock = 430 kg", recon.summary.shutoutKg === 430, `${recon.summary.shutoutKg}`);
ok("clean recon: catalogued total mismatch = 0 (broker and our weights agree)",
  recon.summary.totalMismatchKg === 0, `${recon.summary.totalMismatchKg}`);

// ---- reconcile: anomalies (missing, not-acknowledged, weight delta) ----
const invoicedDirty: InvoicedLot[] = [
  { id: "a", invoiceNo: "0058", grade: "OP", netWt: 275 }, // 5kg short of ack (280)
  { id: "b", invoiceNo: "9999", grade: "OP", netWt: 100 }, // dispatched but not in this ack → not-acknowledged
  // 0074, 0061, 0063, … not invoiced here — but the ack DOES list them, so they
  // stay catalogued/shutout. Having no invoice of ours never demotes a row.
];
const recon2 = reconcileAcknowledgement(invoicedDirty, ack);
const r58 = recon2.rows.find((r) => r.invoiceNo === "0058");
ok("anomaly: 0058 weight delta +5", !!r58 && r58.weightDelta === 5, `${r58?.weightDelta}`);
ok("anomaly: 1 not-acknowledged (9999 not in this partial ack)",
  recon2.summary.notAcknowledged === 1, `${recon2.summary.notAcknowledged}`);
ok("anomaly: every ack line stays acknowledged even with no invoice of ours — 12 + 2",
  recon2.summary.catalogued === 12 && recon2.summary.shutout === 2,
  `catalogued=${recon2.summary.catalogued} shutout=${recon2.summary.shutout}`);
ok("anomaly: 1 weight mismatch flagged", recon2.summary.weightMismatches === 1);
// Only 0058 matched an invoice (9999 has no ack row to sum), so the
// whole-document total mismatch is exactly that one row's delta.
ok("anomaly: catalogued total mismatch = +5 (only 0058 matched, delta +5)",
  recon2.summary.totalMismatchKg === 5, `${recon2.summary.totalMismatchKg}`);

const totalWarningRows: ReconRow[] = [{
  invoiceNo: "0122",
  status: "not-acknowledged",
  invoiced: { id: "not-ack-0122", grade: "FBOFSP", netWt: 136 },
  ack: null,
  weightDelta: null,
  gradeMismatch: false,
}];
const warningRelations = relateAcknowledgementParseWarnings(
  ["Catalogued kg parsed (2120.00) ≠ printed total (2258.00)."],
  totalWarningRows,
);
ok(
  "catalogued-kg warning relates a near-matching un-acknowledged invoice",
  warningRelations.length === 1 && warningRelations[0].rows[0]?.invoiceNo === "0122" && warningRelations[0].differenceKg === 138,
  JSON.stringify(warningRelations),
);

// ── Sample allowance: our net_wt already has it deducted, the broker's
// printed weight has not — comparing net to net (ignoring sample) reported a
// mismatch on every correctly-catalogued lot. netWt + sampleAllowance must
// equal the ack's figure for a clean row.
const invoicedWithSample: InvoicedLot[] = [
  { id: "s1", invoiceNo: "0006", grade: "OP1", netWt: 257.5, sampleAllowance: 2.5 },
  { id: "s2", invoiceNo: "0027", grade: "PEKO", netWt: 296.5, sampleAllowance: 3.5 },
];
const ackWithSample: typeof ack = {
  ...ack,
  lots: [
    { section: "catalogued", markCode: "MF1", markName: "MF1", dispatchDate: null, lotNo: "B1", invoiceNo: "0006", grade: "OP1", bags: 10, kgPerBag: 26, netWt: 260, shutoutReason: null, reprint: false },
    { section: "catalogued", markCode: "MF1", markName: "MF1", dispatchDate: null, lotNo: "B2", invoiceNo: "0027", grade: "PEKO", bags: 10, kgPerBag: 30, netWt: 300, shutoutReason: null, reprint: false },
  ],
};
const reconSample = reconcileAcknowledgement(invoicedWithSample, ackWithSample);
ok("sample allowance: net_wt + sample matches the broker's gross figure — no false mismatch",
  reconSample.summary.weightMismatches === 0 && reconSample.summary.totalMismatchKg === 0,
  JSON.stringify(reconSample.summary));

// ── Sale 024: BPML prints a re-printed invoice as "R0032". The invoice group
// was digits-only, so the whole row failed to match and vanished — the printed
// self-check caught it ("Catalogued lots parsed (7) ≠ printed total (8)") but
// nothing else did. Real document, straight from the broker.
const ack024 = parseAcknowledgement(
  readFileSync(new URL("./__fixtures__/ack-bpml-reprint-sale-024.txt", import.meta.url), "utf8"),
);
ok("sale 024: 8 catalogued + 1 shutout parsed",
  ack024.lots.filter((l) => l.section === "catalogued").length === 8 &&
    ack024.lots.filter((l) => l.section === "shutout").length === 1,
  `catalogued=${ack024.lots.filter((l) => l.section === "catalogued").length} shutout=${ack024.lots.filter((l) => l.section === "shutout").length}`);
ok("sale 024: self-check clean — printed totals now agree",
  ack024.issues.length === 0, ack024.issues.join(" | ") || "no issues");

const r0032 = ack024.lots.find((l) => l.invoiceNo === "0032");
ok("sale 024: R0032 is read as invoice 0032, flagged re-print",
  r0032?.reprint === true && r0032?.lotNo === "1030" && r0032?.grade === "BOP1A",
  r0032 ? `lot=${r0032.lotNo} grade=${r0032.grade} reprint=${r0032.reprint}` : "row missing");
ok("sale 024: a re-print's net wt may sit below bags×kg/bag without a warning",
  r0032?.netWt === 257 && r0032?.bags === 10 && r0032?.kgPerBag === 26,
  `${r0032?.netWt} vs ${(r0032?.bags ?? 0) * (r0032?.kgPerBag ?? 0)}`);
ok("sale 024: ordinary rows are not mistaken for re-prints",
  ack024.lots.filter((l) => l.reprint).length === 1,
  `${ack024.lots.filter((l) => l.reprint).length}`);

console.log(failures === 0 ? "\nAUCTION ACK PARSE + RECON: ALL CHECKS PASSED" : `\nAUCTION ACK: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
