// Asia Siyaka acknowledgement variant: parse the real MF1530 sample.
// Run: pnpm --dir packages/api test:auction (chained after the BPML suite)
import { readFileSync } from "node:fs";
import { isAcknowledgement, parseAcknowledgement, type AckLot } from "./parse-acknowledgement";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!cond) failures++;
}

const text = readFileSync(new URL("./__fixtures__/ack-asia-siyaka.txt", import.meta.url), "utf8");

ok("detected as acknowledgement", isAcknowledgement(text));

const ack = parseAcknowledgement(text);
const byInv = (inv: string): AckLot | undefined => ack.lots.find((l) => l.invoiceNo === inv);

ok("sale no 27", ack.saleNo === "27", `${ack.saleNo}`);
ok("sale date 19/05/2026 (first day of range)", ack.saleDate === "19/05/2026", `${ack.saleDate}`);
ok("self-check clean", ack.issues.length === 0, ack.issues.join(" | ") || "no issues");
ok("9 lots parsed, all catalogued", ack.lots.length === 9 && ack.lots.every((l) => l.section === "catalogued"),
  `${ack.lots.length} lots, ${ack.lots.filter((l) => l.section === "shutout").length} shutout`);

const l951 = byInv("0951");
ok("inv 0951 → lot B0877 BOP1 10×30 = 300kg KUMUDU",
  !!l951 && l951.lotNo === "B0877" && l951.grade === "BOP1" && l951.bags === 10 &&
    l951.kgPerBag === 30 && l951.netWt === 300 && l951.markCode === "KUMUDU" &&
    l951.dispatchDate === "30/04/2026",
  l951 ? `lot=${l951.lotNo} grade=${l951.grade} net=${l951.netWt} mark=${l951.markCode} date=${l951.dispatchDate}` : "missing");

// "02/04/2026RKUMUDU 0909 …" — R flag glued onto the mark name must be stripped.
const l909 = byInv("0909");
ok("inv 0909 → flag letter stripped, mark KUMUDU, 297kg (sample deducted)",
  !!l909 && l909.markCode === "KUMUDU" && l909.netWt === 297 && l909.lotNo === "B1265" &&
    l909.section === "catalogued" && l909.dispatchDate === "02/04/2026",
  l909 ? `mark=${l909.markCode} net=${l909.netWt} lot=${l909.lotNo} date=${l909.dispatchDate}` : "missing");

const l957 = byInv("0957");
ok("inv 0957 → ITTAPANA BM 300kg lot B1686",
  !!l957 && l957.markCode === "ITTAPANA" && l957.grade === "BM" && l957.netWt === 300 &&
    l957.lotNo === "B1686" && l957.dispatchDate === "28/04/2026",
  l957 ? `mark=${l957.markCode} grade=${l957.grade} net=${l957.netWt} date=${l957.dispatchDate}` : "missing");

const l958 = byInv("0958");
ok("inv 0958 → FGS 40kg/chest 400kg",
  !!l958 && l958.grade === "FGS" && l958.kgPerBag === 40 && l958.netWt === 400,
  l958 ? `grade=${l958.grade} kg/chest=${l958.kgPerBag} net=${l958.netWt}` : "missing");

// Total catalogued kg must reconcile with the printed grand total (2,867.00).
const totalKg = ack.lots.reduce((s, l) => s + l.netWt, 0);
ok("total parsed kg = 2867", totalKg === 2867, `${totalKg}`);

console.log(failures === 0 ? "\nASIA SIYAKA ACK PARSE: ALL CHECKS PASSED" : `\nASIA SIYAKA ACK: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
