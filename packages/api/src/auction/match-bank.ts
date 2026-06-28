// Bank-credit ↔ settlement scorer (docs/AUCTION.md §4④). Sibling to match-orphans:
// pure, framework-free, transparent per-dimension breakdown so a human links an
// UNATTRIBUTED bank credit to an UNPAID settlement — bank narration is garbage
// (truncated free text), so nothing auto-commits. Same ScoredCandidate shape as the
// orphan resolver, different dimensions: amount proximity, date-in-prompt-window,
// broker-name keyword in the narration.

export type UnpaidSettlement = {
  settlementId: string;
  contractNo: string;
  totalNetProceeds: number; // full (incl. guaranteed VAT)
  cashOnly: number; // total − guaranteed VAT (broker may pay this first)
  promptDate: string; // YYYY-MM-DD
  brokerName?: string | null;
};

export type UnattributedCredit = {
  txnId: string;
  txnDate: string; // YYYY-MM-DD
  credit: number;
  description: string;
};

export type BankMatchTone = "good" | "warn" | "bad";
export type BankMatchDimension = {
  key: "amount" | "date" | "narration";
  label: string;
  weight: number;
  score: number;
  detail: string;
  tone: BankMatchTone;
};
export type ScoredSettlement = {
  settlement: UnpaidSettlement;
  confidence: number;
  dims: BankMatchDimension[];
};

export const BANK_WEIGHTS = { amount: 0.6, date: 0.25, narration: 0.15 };
const AMOUNT_FLOOR_RATIO = 0.01; // a Δ of ≥1% of the target scores 0
const DATE_WINDOW_DAYS = 21; // payments can land weeks after prompt

const daysBetween = (a: string, b: string) =>
  Math.abs(new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime()) / 86_400_000;

// Closeness to whichever of the two legitimate targets (full / cash-only) is nearer.
function amountScore(credit: number, full: number, cash: number): { score: number; which: "full" | "cash"; delta: number } {
  const dFull = full ? Math.abs(credit - full) / full : 1;
  const dCash = cash ? Math.abs(credit - cash) / cash : 1;
  const useFull = dFull <= dCash;
  const ratio = useFull ? dFull : dCash;
  return { score: Math.max(0, 1 - ratio / AMOUNT_FLOOR_RATIO), which: useFull ? "full" : "cash", delta: credit - (useFull ? full : cash) };
}

function narrationScore(desc: string, brokerName: string | null | undefined): number | null {
  if (!brokerName) return null;
  const tokens = brokerName.toLowerCase().split(/\s+/).filter((t) => t.length >= 4);
  if (tokens.length === 0) return null;
  const d = desc.toLowerCase();
  const hits = tokens.filter((t) => d.includes(t)).length;
  if (hits === 0) return 0;
  return hits === tokens.length ? 1 : 0.5;
}

export function scoreSettlement(credit: UnattributedCredit, s: UnpaidSettlement): { confidence: number; dims: BankMatchDimension[] } {
  const dims: BankMatchDimension[] = [];

  const a = amountScore(credit.credit, s.totalNetProceeds, s.cashOnly);
  dims.push({
    key: "amount", label: "Amount", weight: BANK_WEIGHTS.amount, score: a.score,
    detail: a.delta === 0
      ? `Exact (${a.which})`
      : `${a.delta > 0 ? "+" : "−"}${Math.abs(a.delta).toFixed(2)} vs ${a.which} target`,
    tone: a.score > 0.8 ? "good" : a.score > 0.4 ? "warn" : "bad",
  });

  const gap = daysBetween(credit.txnDate, s.promptDate);
  const dScore = Math.max(0, 1 - gap / DATE_WINDOW_DAYS);
  dims.push({
    key: "date", label: "Date", weight: BANK_WEIGHTS.date, score: dScore,
    detail: `${Math.round(gap)} day(s) from prompt ${s.promptDate}`,
    tone: gap <= 3 ? "good" : gap <= DATE_WINDOW_DAYS ? "warn" : "bad",
  });

  const nScore = narrationScore(credit.description, s.brokerName);
  if (nScore !== null) {
    dims.push({
      key: "narration", label: "Narration", weight: BANK_WEIGHTS.narration, score: nScore,
      detail: nScore === 1 ? "Broker name in narration" : nScore > 0 ? "Partial narration match" : "No narration match",
      tone: nScore === 1 ? "good" : nScore > 0 ? "warn" : "bad",
    });
  }

  const totalW = dims.reduce((s2, d) => s2 + d.weight, 0);
  const confidence = dims.reduce((s2, d) => s2 + d.weight * d.score, 0) / totalW;
  return { confidence, dims };
}

// Rank unpaid settlements as candidates for one unattributed credit.
export function rankSettlements(credit: UnattributedCredit, pool: UnpaidSettlement[]): ScoredSettlement[] {
  return pool
    .map((s) => ({ settlement: s, ...scoreSettlement(credit, s) }))
    .sort((a, b) => b.confidence - a.confidence);
}
