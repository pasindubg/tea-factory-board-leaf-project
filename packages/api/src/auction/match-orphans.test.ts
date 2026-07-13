// Orphan-resolver scoring test. Run: pnpm --dir packages/api test:match
import { rankCandidates, scoreCandidate, type OrphanLot, type CandidateLot } from "./match-orphans";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!cond) failures++;
}

// Missing invoice 0039 (OP1 · 280 kg), no catalogued lot → no lot hint.
const orphan: OrphanLot = { invoiceNo: "0039", grade: "OP1", netWt: 280, markCode: "MF1530", lotHint: null };

// Pool = "unexpected" acknowledgement lots (mark MF1530), + one foreign-mark lot.
const pool: CandidateLot[] = [
  { key: "0481", lotNo: "0481", grade: "OP1", netWt: 300, markCode: "MF1530" }, // grade exact, +20kg
  { key: "0477", lotNo: "0477", grade: "OP", netWt: 280, markCode: "MF1530" }, // weight exact, family
  { key: "0484", lotNo: "0484", grade: "OPA", netWt: 280, markCode: "MF1530" }, // weight exact, family
  { key: "1270", lotNo: "1270", grade: "BM", netWt: 300, markCode: "MF1530" }, // far grade
  { key: "9999", lotNo: "9999", grade: "OP1", netWt: 280, markCode: "MF1530A" }, // different mark → filtered
];

const ranked = rankCandidates(orphan, pool);

ok("mark filter excludes foreign-mark candidate", ranked.every((r) => r.candidate.key !== "9999"), `${ranked.length} candidates`);
ok("top candidate is lot 0481 (grade exact)", ranked[0]?.candidate.lotNo === "0481", ranked[0]?.candidate.lotNo ?? "");
ok("top confidence ≈ 90% (high)", ranked[0].confidence > 0.85 && ranked[0].confidence < 0.95, `${Math.round(ranked[0].confidence * 100)}%`);

const op280 = ranked.find((r) => r.candidate.key === "0477")!;
ok("weight-exact family match ≈ 73% (medium)", op280.confidence > 0.65 && op280.confidence < 0.8, `${Math.round(op280.confidence * 100)}%`);
ok("0481 ranks above 0477 (grade beats weight)", ranked.findIndex((r) => r.candidate.key === "0481") < ranked.findIndex((r) => r.candidate.key === "0477"));

const bm = ranked.find((r) => r.candidate.key === "1270")!;
ok("cross-family (BM) scores lowest", bm.confidence === Math.min(...ranked.map((r) => r.confidence)), `${Math.round(bm.confidence * 100)}%`);

// Transparency: every candidate exposes a per-dimension breakdown.
const { dims } = scoreCandidate(orphan, pool[0]);
ok("breakdown has grade + weight, no lot (no hint)", dims.length === 2 && dims.some((d) => d.key === "grade") && dims.some((d) => d.key === "weight"));

// Lot hint contributes when present.
const withHint = scoreCandidate({ ...orphan, lotHint: "0481" }, pool[0]);
ok("lot hint adds a third dimension", withHint.dims.length === 3 && withHint.dims.some((d) => d.key === "lot"));

console.log(failures === 0 ? "\nORPHAN MATCH SCORING: ALL CHECKS PASSED" : `\nORPHAN MATCH: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
