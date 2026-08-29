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

// This document has no sale number to read — the old "27" was a Days Held
// value the extractor had reflowed under the title, and the same "27" came out
// of seven unrelated sales. Null, so the display falls back to the sale the
// document was uploaded against.
ok("no sale no is invented from the header", ack.saleNo === null, `${ack.saleNo}`);
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

// ── Sale 020: the S/V flag stands alone in the LotNo column ─────────────────
// This layout held one lot back, and the row it prints has no catalogue number
// at all — just the bare "B" prefix. Parsing it is what puts the lot on the
// reconciliation screen as a shutout instead of dropping it silently.
const sale20 = parseAcknowledgement(
  readFileSync(new URL("./__fixtures__/ack-asia-siyaka-sale-020.txt", import.meta.url), "utf8"),
);
const s20 = (inv: string): AckLot | undefined => sale20.lots.find((l) => l.invoiceNo === inv);

ok("sale 020: 7 lots parsed — 6 catalogued + 1 shutout",
  sale20.lots.length === 7 && sale20.lots.filter((l) => l.section === "shutout").length === 1,
  `${sale20.lots.length} lots, ${sale20.lots.filter((l) => l.section === "shutout").length} shutout`);

const held = s20("0901");
ok("sale 020: inv 0901 → shutout, no lot no, reason names the S flag",
  !!held && held.section === "shutout" && held.lotNo === null && held.netWt === 496 &&
    held.shutoutReason === "Shutout (S) in the acknowledgement",
  held ? `section=${held.section} lot=${held.lotNo} net=${held.netWt} reason=${held.shutoutReason}` : "missing");

// R is glued to the mark on that same row (RKUMUDU) and means re-print — it must
// not be read as a second held-back flag, and the mark must still resolve.
ok("sale 020: inv 0901 keeps mark KUMUDU despite the R re-print prefix",
  !!held && held.markCode === "KUMUDU", held ? `mark=${held.markCode}` : "missing");

ok("sale 020: inv 0901 is flagged as a re-print by the R prefix",
  held?.reprint === true, `reprint=${held?.reprint}`);

ok("sale 020: an unflagged row is not a re-print",
  s20("0012")?.reprint === false, `reprint=${s20("0012")?.reprint}`);

ok("sale 020: catalogued lots carry no shutout reason",
  sale20.lots.filter((l) => l.section === "catalogued").every((l) => l.shutoutReason === null));

// 0014/0015 sit under the ITTAPANA block, whose own Shutout & Violation
// quantity is 0.00 — they are catalogued, not held back.
ok("sale 020: inv 0014 and 0015 are catalogued",
  s20("0014")?.section === "catalogued" && s20("0015")?.section === "catalogued",
  `0014=${s20("0014")?.section} 0015=${s20("0015")?.section}`);

// Held-back weight is excluded from the catalogued total the document prints
// (1,890.00), which is what the parser's own self-check compares against.
ok("sale 020: self-check clean", sale20.issues.length === 0, sale20.issues.join(" "));

// ── Sale 022: a grade with a lowercase tail (FBOPFSp) ───────────────────────
// The row was dropped whole, so its invoice read as never acknowledged and the
// catalogue total came up 88 kg short of the figure the document itself prints.
const sale22 = parseAcknowledgement(
  readFileSync(new URL("./__fixtures__/ack-asia-siyaka-sale-022.txt", import.meta.url), "utf8"),
);
const catalogued22 = sale22.lots.filter((l) => l.section === "catalogued");

ok("sale 022: all 9 catalogued rows parsed, 2588 kg — matches the printed total",
  catalogued22.length === 9 && catalogued22.reduce((sum, l) => sum + l.netWt, 0) === 2588,
  `${catalogued22.length} rows, ${catalogued22.reduce((sum, l) => sum + l.netWt, 0)} kg`);

const mixedCase = sale22.lots.find((l) => l.invoiceNo === "0028");
ok("sale 022: inv 0028 FBOPFSp 2×44 = 88kg is catalogued, not missing",
  mixedCase?.section === "catalogued" && mixedCase.grade === "FBOPFSp" && mixedCase.netWt === 88,
  mixedCase ? `grade=${mixedCase.grade} net=${mixedCase.netWt}` : "missing");

ok("sale 022: self-check clean", sale22.issues.length === 0, sale22.issues.join(" "));

console.log(failures === 0 ? "\nASIA SIYAKA ACK PARSE: ALL CHECKS PASSED" : `\nASIA SIYAKA ACK: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
