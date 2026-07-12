// A1 verification gate: parse the real Sale-023 Acknowledgement + reconcile.
// Run: pnpm --dir packages/api test:auction
import { readFileSync } from "node:fs";
import { parseAcknowledgement, type AckLot } from "./parse-acknowledgement";
import { reconcileAcknowledgement, type InvoicedLot } from "./reconcile";

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
ok("clean recon: 12 catalogued, 2 shutout, 0 pending/unexpected",
  recon.summary.catalogued === 12 && recon.summary.shutout === 2 &&
    recon.summary.pending === 0 && recon.summary.unexpected === 0 && recon.summary.weightMismatches === 0,
  JSON.stringify(recon.summary));
ok("clean recon: shutout stock = 430 kg", recon.summary.shutoutKg === 430, `${recon.summary.shutoutKg}`);

// ---- reconcile: anomalies (missing, unexpected, weight delta) ----
const invoicedDirty: InvoicedLot[] = [
  { id: "a", invoiceNo: "0058", grade: "OP", netWt: 275 }, // 5kg short of ack (280)
  { id: "b", invoiceNo: "9999", grade: "OP", netWt: 100 }, // dispatched but not in this ack → pending
  // 0074, 0061, 0063, … not invoiced here → those ack rows become "unexpected"
];
const recon2 = reconcileAcknowledgement(invoicedDirty, ack);
const r58 = recon2.rows.find((r) => r.invoiceNo === "0058");
ok("anomaly: 0058 weight delta +5", !!r58 && r58.weightDelta === 5, `${r58?.weightDelta}`);
ok("anomaly: 1 pending (9999 not in this partial ack)", recon2.summary.pending === 1, `${recon2.summary.pending}`);
ok("anomaly: 13 unexpected (ack rows not invoiced)", recon2.summary.unexpected === 13, `${recon2.summary.unexpected}`);
ok("anomaly: 1 weight mismatch flagged", recon2.summary.weightMismatches === 1);

console.log(failures === 0 ? "\nAUCTION ACK PARSE + RECON: ALL CHECKS PASSED" : `\nAUCTION ACK: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
