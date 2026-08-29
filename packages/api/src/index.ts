// Shared server-side logic. The payment-calculation engine (M6) is the first
// real export — a pure, fixture-tested function the web app's payment-generation
// server action calls. tRPC routers can wrap these later if a typed RPC
// transport is needed; today App Router server actions call them directly.
export * from "./payments/calculate";
// Auction & settlement (A-track): pure document parsers + reconciliations.
export * from "./auction/invoice-key";
export * from "./auction/broker-format";
export * from "./auction/parse-acknowledgement";
export * from "./auction/reconcile";
export * from "./auction/parse-valuation";
export * from "./auction/parse-contract";
export * from "./auction/parse-contract-rates";
export * from "./auction/read-xlsx";
export * from "./auction/parse-dispatch-sheet";
export * from "./auction/reconcile-valuation";
export * from "./auction/compute-settlement";
export * from "./auction/validate-revenue";
export * from "./auction/reconcile-vat";
export * from "./auction/parse-bank-csv";
export * from "./auction/reconcile-bank";
export * from "./auction/match-orphans";
export * from "./auction/match-carry-forward";
export * from "./auction/match-bank";
