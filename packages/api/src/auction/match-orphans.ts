// Orphan resolver — transparent scoring core (docs/AUCTION.md §4①).
// Pure & framework-free. Ranks candidate lots against an orphaned invoice so a
// human can manually link a `missing` invoice to an `unexpected` acknowledgement
// lot (or vice-versa). The whole point is transparency: every candidate carries a
// per-dimension breakdown so the person — not the machine — makes the final call.
// Nothing here auto-links. Reused at Stage 3 (bank) with a different candidate pool.

// Ceylon leaf grades grouped into families. Same-family grades are commercially
// adjacent (you'd never confuse OP1 with PEK), so a family match is a strong
// signal and a cross-family match a weak one.
const GRADE_FAMILY: Record<string, string> = {
  OP1: "OP", OP: "OP", OPA: "OP", OPA1: "OP",
  PEK: "PEK", PEK1: "PEK",
  BOP: "BOP", BOP1: "BOP", BOPF: "BOP", FBOP: "BOP",
  PF: "FNGS", PF1: "FNGS", FNGS: "FNGS",
  DUST: "DUST", D1: "DUST",
  BM: "BM",
};

// Tunable. Grade dominates (it rarely drifts); weight is secondary (re-weighing /
// shrinkage is normal); lot proximity is a tie-breaker, only when a hint exists.
export const MATCH_WEIGHTS = { grade: 0.6, weight: 0.3, lot: 0.1 };
const GRADE_EXACT = 1.0;
const GRADE_FAMILY_MATCH = 0.6;
const GRADE_CROSS = 0.05;
const WEIGHT_FLOOR_RATIO = 0.25; // a Δ of ≥25% of the orphan weight scores 0

export type OrphanLot = {
  invoiceNo: string;
  grade: string;
  netWt: number;
  markCode: string | null;
  lotHint?: string | null;
};

export type CandidateLot = {
  key: string; // stable id for selection (e.g. ack invoiceNo or lot no)
  lotNo: string | null;
  grade: string;
  netWt: number;
  markCode: string | null;
};

export type MatchTone = "good" | "warn" | "bad";

export type MatchDimension = {
  key: "grade" | "weight" | "lot";
  label: string;
  weight: number;
  score: number;
  detail: string;
  tone: MatchTone;
};

export type ScoredCandidate = {
  candidate: CandidateLot;
  confidence: number; // 0..1
  dims: MatchDimension[];
};

const norm = (g: string) => g.toUpperCase().replace(/\s+/g, "");

function gradeScore(a: string, b: string): number {
  const x = norm(a), y = norm(b);
  if (x === y) return GRADE_EXACT;
  if (GRADE_FAMILY[x] && GRADE_FAMILY[x] === GRADE_FAMILY[y]) return GRADE_FAMILY_MATCH;
  return GRADE_CROSS;
}

function weightScore(orphanKg: number, candKg: number): number {
  if (!orphanKg) return 0;
  const ratio = Math.abs(orphanKg - candKg) / orphanKg;
  return Math.max(0, 1 - ratio / WEIGHT_FLOOR_RATIO);
}

// Normalised closeness of two lot numbers (1 = identical, 0 = far). null when
// there's no hint — the usual case for a missing invoice with no catalogued lot.
function lotScore(hint: string | null | undefined, candLot: string | null): number | null {
  if (!hint || !candLot) return null;
  const a = parseInt(String(hint).replace(/\D/g, ""), 10);
  const b = parseInt(String(candLot).replace(/\D/g, ""), 10);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, 1 - Math.abs(a - b) / 50); // within ~50 is meaningful
}

export function scoreCandidate(orphan: OrphanLot, candidate: CandidateLot): {
  confidence: number;
  dims: MatchDimension[];
} {
  const dims: MatchDimension[] = [];

  const g = gradeScore(orphan.grade, candidate.grade);
  dims.push({
    key: "grade", label: "Grade", weight: MATCH_WEIGHTS.grade, score: g,
    detail:
      g === GRADE_EXACT ? `Exact (${candidate.grade})`
      : g === GRADE_FAMILY_MATCH ? `Same family (${orphan.grade}↔${candidate.grade})`
      : `Different family (${candidate.grade})`,
    tone: g === GRADE_EXACT ? "good" : g === GRADE_FAMILY_MATCH ? "warn" : "bad",
  });

  const w = weightScore(orphan.netWt, candidate.netWt);
  const delta = candidate.netWt - orphan.netWt;
  const pct = orphan.netWt ? Math.round((Math.abs(delta) / orphan.netWt) * 100) : 0;
  dims.push({
    key: "weight", label: "Weight", weight: MATCH_WEIGHTS.weight, score: w,
    detail: delta === 0 ? "Exact match" : `${delta > 0 ? "+" : "−"}${Math.abs(delta).toFixed(2)} kg (${pct}%)`,
    tone: pct <= 2 ? "good" : pct <= 10 ? "warn" : "bad",
  });

  const l = lotScore(orphan.lotHint, candidate.lotNo);
  if (l !== null) {
    dims.push({
      key: "lot", label: "Lot no.", weight: MATCH_WEIGHTS.lot, score: l,
      detail: `Lot ${candidate.lotNo} vs hint ${orphan.lotHint}`,
      tone: l > 0.8 ? "good" : l > 0.4 ? "warn" : "bad",
    });
  }

  // Renormalise over the dimensions actually present, so a missing lot hint
  // doesn't silently drag every candidate's confidence down.
  const totalW = dims.reduce((s, d) => s + d.weight, 0);
  const confidence = dims.reduce((s, d) => s + d.weight * d.score, 0) / totalW;
  return { confidence, dims };
}

// Filter the pool by the hard rule (same factory mark, when both are known) then
// rank by confidence. Mark is a filter, never a score.
export function rankCandidates(orphan: OrphanLot, pool: CandidateLot[]): ScoredCandidate[] {
  return pool
    .filter((c) => !orphan.markCode || !c.markCode || c.markCode === orphan.markCode)
    .map((c) => ({ candidate: c, ...scoreCandidate(orphan, c) }))
    .sort((a, b) => b.confidence - a.confidence);
}

export const matchBand = (c: number) =>
  c >= 0.8 ? "high" : c >= 0.5 ? "medium" : "low";
