// Shared helpers for presenting `doc_imports` rows across the auction module —
// the per-sale Documents tab and the global Document Details page both need
// the same status/active derivation, so it lives here once.

export type AuctionDocType = "grn" | "acknowledgement" | "valuation" | "contract" | "bank_csv";
export type DocumentStatus = "valid" | "warning" | "issue";

export const DOC_TYPE_LABELS: Record<AuctionDocType, string> = {
  acknowledgement: "Acknowledgement",
  grn: "GRN",
  valuation: "Valuation report",
  contract: "Sellers contract",
  bank_csv: "Bank statement",
};

export type DocImportStatusRow = {
  id: string;
  doc_type: AuctionDocType;
  status: "parsed" | "reviewed" | "confirmed" | "rejected";
  parsed_at: string | null;
  confirmed_at: string | null;
  parsed_json?: unknown;
};

export function docParseIssueCount(parsedJson: unknown): number {
  if (parsedJson && typeof parsedJson === "object" && Array.isArray((parsedJson as { issues?: unknown }).issues)) {
    return (parsedJson as { issues: unknown[] }).issues.length;
  }
  return 0;
}

export function docStatus(doc: Pick<DocImportStatusRow, "status" | "parsed_json">): { status: DocumentStatus; label: string } {
  if (doc.status === "rejected") return { status: "issue", label: "Issue" };
  return docParseIssueCount(doc.parsed_json) > 0 ? { status: "warning", label: "Warning" } : { status: "valid", label: "Valid" };
}

/**
 * A sale can have multiple brokers, each submitting their own acknowledgement/
 * valuation/contract (see saleGroupIds — reconciliation is scoped per broker
 * within a sale). "Active" tracks the latest confirmed import per (doc type,
 * broker), not per doc type alone — otherwise one broker's confirmed report
 * would wrongly supersede another broker's.
 */
export function computeActiveDocumentIds<T extends DocImportStatusRow>(
  docs: readonly T[],
  brokerKeyOf: (doc: T) => string,
): Set<string> {
  const latestByKey = new Map<string, T>();
  for (const doc of docs) {
    if (doc.status !== "confirmed") continue;
    const key = `${doc.doc_type}:${brokerKeyOf(doc)}`;
    const current = latestByKey.get(key);
    const docTime = doc.confirmed_at ?? doc.parsed_at ?? "";
    const currentTime = current ? (current.confirmed_at ?? current.parsed_at ?? "") : "";
    if (!current || docTime > currentTime) latestByKey.set(key, doc);
  }
  return new Set([...latestByKey.values()].map((doc) => doc.id));
}
