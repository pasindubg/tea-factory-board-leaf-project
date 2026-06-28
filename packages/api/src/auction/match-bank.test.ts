// Bank-credit matching test. Run: pnpm --dir packages/api test:bank
import { rankSettlements, scoreSettlement, type UnpaidSettlement, type UnattributedCredit } from "./match-bank";

let failures = 0;
const ok = (l: string, c: boolean, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${l}${d ? " — " + d : ""}`); if (!c) failures++; };

// Sale 023 KUMUDU: TNP 5,733,046.98 (full) / 5,566,186.98 (cash-only), prompt 24/06.
const kumudu: UnpaidSettlement = {
  settlementId: "k", contractNo: "2026/023/0110",
  totalNetProceeds: 5733046.98, cashOnly: 5566186.98, promptDate: "2026-06-24", brokerName: "BPML Produce Marketing",
};
const ittapana: UnpaidSettlement = {
  settlementId: "i", contractNo: "2026/023/0111",
  totalNetProceeds: 299898.85, cashOnly: 299898.85, promptDate: "2026-06-24", brokerName: "BPML Produce Marketing",
};

// A credit that is the KUMUDU full amount, on prompt date, narration mentions BPML.
const credit: UnattributedCredit = {
  txnId: "t1", txnDate: "2026-06-24", credit: 5733046.98, description: "TRANSFER FROM BPML PRODUCE",
};

const ranked = rankSettlements(credit, [kumudu, ittapana]);
ok("KUMUDU ranks top for its own full amount", ranked[0].settlement.settlementId === "k", ranked[0].settlement.contractNo);
ok("top confidence is high", ranked[0].confidence > 0.85, `${Math.round(ranked[0].confidence * 100)}%`);
ok("ITTAPANA (wrong amount) scores far lower", ranked[1].confidence < 0.6, `${Math.round(ranked[1].confidence * 100)}%`);

// Cash-only amount also matches (broker paid ex-guarantee first).
const cashCredit: UnattributedCredit = { txnId: "t2", txnDate: "2026-06-25", credit: 5566186.98, description: "CREDIT" };
const cashScore = scoreSettlement(cashCredit, kumudu);
ok("cash-only amount still matches well", cashScore.confidence > 0.7, `${Math.round(cashScore.confidence * 100)}%`);
ok("broker name present → 3 dims (amount, date, narration)", cashScore.dims.length === 3, `${cashScore.dims.length}`);

// No broker name → narration dimension is dropped and weights renormalize.
const noBroker: UnpaidSettlement = { ...kumudu, brokerName: null };
const { dims } = scoreSettlement(cashCredit, noBroker);
ok("no broker name → narration dim dropped (renormalized)", dims.length === 2, `${dims.length}`);

console.log(failures === 0 ? "\nBANK MATCH SCORING: ALL CHECKS PASSED" : `\nBANK MATCH: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
