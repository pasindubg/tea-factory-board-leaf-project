// Reconciliation ④ — settlement ↔ bank (docs/AUCTION.md §4④).
// Matches broker settlement payments to bank statement credits.
//
// Algorithm (tolerant): around each settlement's prompt date, find a bank
// credit matching either:
//   - total_net_proceeds (full VAT) → match "full"
//   - total_net_proceeds − guaranteed_vat (cash-only) → match "cash_only"
//   - or an exact cheque match by reference no.
//
// Works within a configurable date window and numerical tolerance.

export type SettlementForMatching = {
  settlementId: string;
  contractNo: string;
  totalNetProceeds: number;
  guaranteedVat: number;
  promptDate: string; // YYYY-MM-DD
};

export type BankCreditForMatching = {
  txnId: string;
  txnDate: string; // YYYY-MM-DD
  credit: number;
  description: string;
  chequeNo: string | null;
};

export type MatchResult = {
  settlementId: string;
  bankTxnId: string;
  matchType: "full" | "cash_only" | "cheque";
  amount: number;
};

export type BankReconOutput = {
  matches: MatchResult[];
  unmatchedSettlements: string[]; // settlement ids with no matching credit
  unmatchedTxns: string[];        // txn ids with no matching settlement
  summary: {
    totalSettlements: number;
    matched: number;
    fullMatches: number;
    cashOnlyMatches: number;
    chequeMatches: number;
    totalCredits: number;
    matchedCredits: number;
  };
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function reconcileBank(
  settlements: SettlementForMatching[],
  credits: BankCreditForMatching[],
  opts: { windowDays?: number; tolerance?: number } = {},
): BankReconOutput {
  const windowDays = opts.windowDays ?? 5;
  const tolerance = opts.tolerance ?? 1; // LKR 1 tolerance

  const matches: MatchResult[] = [];
  const matchedSettlements = new Set<string>();
  const matchedTxns = new Set<string>();

  for (const s of settlements) {
    const promptMs = new Date(`${s.promptDate}T00:00:00`).getTime();
    if (Number.isNaN(promptMs)) continue;

    // Two targets: full and cash-only
    const fullTarget = s.totalNetProceeds;
    const cashTarget = r2(s.totalNetProceeds - s.guaranteedVat);

    let found = false;

    for (const c of credits) {
      if (matchedTxns.has(c.txnId)) continue;
      const txnMs = new Date(`${c.txnDate}T00:00:00`).getTime();
      if (Number.isNaN(txnMs)) continue;

      const diffDays = Math.abs(txnMs - promptMs) / (24 * 60 * 60 * 1000);
      if (diffDays > windowDays) continue;

      // Cheque match takes priority
      if (c.chequeNo && s.contractNo && c.chequeNo.includes(s.contractNo)) {
        matches.push({ settlementId: s.settlementId, bankTxnId: c.txnId, matchType: "cheque", amount: c.credit });
        matchedSettlements.add(s.settlementId);
        matchedTxns.add(c.txnId);
        found = true;
        break;
      }

      // Full match
      if (Math.abs(c.credit - fullTarget) <= tolerance) {
        matches.push({ settlementId: s.settlementId, bankTxnId: c.txnId, matchType: "full", amount: c.credit });
        matchedSettlements.add(s.settlementId);
        matchedTxns.add(c.txnId);
        found = true;
        break;
      }

      // Cash-only match
      if (Math.abs(c.credit - cashTarget) <= tolerance) {
        matches.push({ settlementId: s.settlementId, bankTxnId: c.txnId, matchType: "cash_only", amount: c.credit });
        matchedSettlements.add(s.settlementId);
        matchedTxns.add(c.txnId);
        found = true;
        break;
      }
    }
  }

  const unmatchedSettlements = settlements
    .filter((s) => !matchedSettlements.has(s.settlementId))
    .map((s) => s.settlementId);
  const unmatchedTxns = credits
    .filter((c) => !matchedTxns.has(c.txnId))
    .map((c) => c.txnId);

  const matchTypes = (t: MatchResult["matchType"]) => matches.filter((m) => m.matchType === t).length;

  return {
    matches,
    unmatchedSettlements,
    unmatchedTxns,
    summary: {
      totalSettlements: settlements.length,
      matched: matchedSettlements.size,
      fullMatches: matchTypes("full"),
      cashOnlyMatches: matchTypes("cash_only"),
      chequeMatches: matchTypes("cheque"),
      totalCredits: credits.length,
      matchedCredits: matchedTxns.size,
    },
  };
}
