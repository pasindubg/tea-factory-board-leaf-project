// The broker's deduction RATE CARD, read off the Account Sales block of a Tea
// Sellers Contract (docs/AUCTION.md §7).
//
// The contract is the source of truth for what a broker charges: it prints the
// rate next to every line of the stack —
//
//     1  Insurance Cover @ Rs.0.06 Per kg                   13.20
//     2  Public Sale Ex. Rs.87.87                           87.87
//     3  Brokerage @ 1.00%                               2,464.00
//     4  Handling Charge @ Rs.3.58 Per Kg                  787.60
//     5  Documentation Charge @ Rs.25.00 per lot            25.00
//        VAT 18% on 1,2,3,4,5 (Charged by Broker)          607.99
//        e-Platform charge Rs.0.250 per Kg.                 55.00
//
// Only the RATES are parsed, never the amounts beside them. PDF text
// extraction returns the page in drawing order, not reading order, so those
// figures arrive detached from their labels and cannot be attributed reliably.
// The rates live INSIDE the label text, which survives intact — and they are
// what the rate card needs, since computeSettlement derives every amount from
// them anyway.
//
// Both broker layouts print the same wording with different spacing
// ("Rs.0.06" vs "Rs. 0.060", "VAT 18%" vs "VAT 18 %"), so every pattern is
// whitespace-tolerant rather than format-specific.

export type ContractRates = {
  insurancePerKg: number | null;
  publicSaleExPerLot: number | null;
  brokeragePct: number | null;
  handlingPerKg: number | null;
  documentationPerLot: number | null;
  eplatformPerKg: number | null;
  chargesVatPct: number | null;
  proceedsVatPct: number | null;
};

/** The rate-card fields, in the order the contract prints them. */
export const CONTRACT_RATE_FIELDS = [
  "insurancePerKg",
  "publicSaleExPerLot",
  "brokeragePct",
  "handlingPerKg",
  "documentationPerLot",
  "eplatformPerKg",
  "chargesVatPct",
  "proceedsVatPct",
] as const satisfies readonly (keyof ContractRates)[];

export const CONTRACT_RATE_LABELS: Record<keyof ContractRates, string> = {
  insurancePerKg: "Insurance cover (per kg)",
  publicSaleExPerLot: "Public sale expenses (per lot)",
  brokeragePct: "Brokerage (%)",
  handlingPerKg: "Handling charge (per kg)",
  documentationPerLot: "Documentation charge (per lot)",
  eplatformPerKg: "e-Platform charge (per kg)",
  chargesVatPct: "VAT on broker charges (%)",
  proceedsVatPct: "VAT on proceeds (%)",
};

const PATTERNS: Record<keyof ContractRates, RegExp> = {
  insurancePerKg: /Insurance\s+Cover\s*@?\s*Rs\.?\s*([\d,.]+)\s*Per\s*kg/i,
  publicSaleExPerLot: /Public\s+Sale\s+Ex\.?\s*@?\s*Rs\.?\s*([\d,.]+)/i,
  brokeragePct: /Brokerage\s*@\s*([\d,.]+)\s*%/i,
  handlingPerKg: /Handling\s+Charge\s*@?\s*Rs\.?\s*([\d,.]+)\s*Per\s*Kg/i,
  documentationPerLot: /Documentation\s+Charge\s*@?\s*Rs\.?\s*([\d,.]+)\s*per\s*lot/i,
  eplatformPerKg: /e-?Platform\s+charge\s*@?\s*Rs\.?\s*([\d,.]+)\s*per\s*Kg/i,
  // "VAT 18% on 1,2,3,4,5 (Charged by Broker)" — the charges-side VAT.
  chargesVatPct: /VAT\s*([\d.]+)\s*%\s*on\s*1\s*,\s*2\s*,\s*3\s*,\s*4\s*,\s*5/i,
  // "VAT @ 18% (Charged from Buyers on behalf of the Seller)" — the proceeds
  // side, which the buyer funds and the factory remits.
  proceedsVatPct: /VAT\s*@\s*([\d.]+)\s*%\s*\(\s*Charged\s+from\s+Buyers/i,
};

function rate(text: string, pattern: RegExp): number | null {
  const raw = pattern.exec(text)?.[1];
  if (raw == null) return null;
  const value = Number(raw.replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

/** Reads every rate the Account Sales block states. Missing values stay null —
 * a charge a broker does not levy is absent from the page, and null must not be
 * confused with a genuine zero. */
export function parseContractRates(rawText: string): ContractRates {
  const text = rawText.replace(/\s+/g, " ");
  return Object.fromEntries(
    CONTRACT_RATE_FIELDS.map((field) => [field, rate(text, PATTERNS[field])]),
  ) as ContractRates;
}

/** True once the contract states enough to build a rate card from. */
export function hasContractRates(rates: ContractRates): boolean {
  return CONTRACT_RATE_FIELDS.some((field) => rates[field] != null);
}

export type RateDifference = {
  field: keyof ContractRates;
  label: string;
  /** What the contract prints — the source of truth. */
  contract: number;
  /** What the stored rate card says. */
  stored: number;
};

/**
 * Where the stored rate card disagrees with the contract.
 *
 * The contract is authoritative: it is the document the broker actually
 * settled on. A difference means the stored card is stale (or was entered by
 * hand incorrectly), and every settlement computed from it is wrong — so this
 * is surfaced for a human rather than silently auto-corrected.
 *
 * Compared at 4 decimal places, matching the widest scale the rate columns
 * store, so a pure representation difference never raises a false alarm.
 */
export function contractRateDifferences(
  contract: ContractRates,
  stored: Partial<Record<keyof ContractRates, number | string | null>>,
): RateDifference[] {
  const differences: RateDifference[] = [];
  for (const field of CONTRACT_RATE_FIELDS) {
    const fromContract = contract[field];
    if (fromContract == null) continue;
    const raw = stored[field];
    if (raw == null || raw === "") continue;
    const fromStore = Number(raw);
    if (!Number.isFinite(fromStore)) continue;
    if (Math.abs(fromContract - fromStore) < 0.00005) continue;
    differences.push({
      field,
      label: CONTRACT_RATE_LABELS[field],
      contract: fromContract,
      stored: fromStore,
    });
  }
  return differences;
}
