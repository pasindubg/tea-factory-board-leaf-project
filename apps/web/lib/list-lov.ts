/**
 * Client-safe identities and row contracts for framework LOV (list-of-values)
 * pickers — the typeahead comboboxes used by list create/edit rows and, where
 * declared, by the list search panel.
 *
 * A source key is intentionally not a table name. It names a server-owned,
 * allowlisted option query (see list-lov-registry.ts). The browser sends only
 * a key plus the text the user typed; the tenant, the table, the columns, and
 * the row ceiling are all resolved server-side.
 */

/**
 * One row in a LOV dropdown. `description` is the secondary line rendered
 * under the label (a mark's full name, a broker's VAT no., a grade's name),
 * so a picker can disambiguate options that share a short code.
 */
export type LovOption = {
  value: string;
  label: string;
  description?: string | null;
};

export type LovSourceKey =
  | "auction.brokers"
  | "auction.marks"
  | "auction.grades"
  | "auction.buyers"
  | "auction.warehouses"
  | "leaf.suppliers"
  | "leaf.collectors";

export const LOV_SOURCE_KEYS = [
  "auction.brokers",
  "auction.marks",
  "auction.grades",
  "auction.buyers",
  "auction.warehouses",
  "leaf.suppliers",
  "leaf.collectors",
] as const satisfies readonly LovSourceKey[];

/**
 * Exhaustiveness guard, mirroring LIST_RESOURCE_KEYS in list-resources.ts: the
 * `satisfies` above only proves every listed key is real, not that every real
 * key is listed. A source added to LovSourceKey but forgotten here typechecks
 * cleanly and then fails at runtime with "Unknown LOV source.", because
 * LOV_SOURCE_KEYS is the allowlist isLovSourceKey enforces.
 */
const _everyLovSourceKeyIsRegistered: never[] =
  [] as Exclude<LovSourceKey, (typeof LOV_SOURCE_KEYS)[number]>[];
void _everyLovSourceKeyIsRegistered;

export function isLovSourceKey(value: unknown): value is LovSourceKey {
  return typeof value === "string" && (LOV_SOURCE_KEYS as readonly string[]).includes(value);
}

export type LovResult =
  | { ok: true; options: LovOption[]; hasMore: boolean }
  | { ok: false; error: string };

/**
 * Rows per LOV request. Deliberately small: a picker opens showing one short
 * page and pulls the next as the user scrolls, so a reference table with
 * thousands of rows costs the same to open as one with ten.
 */
export const LOV_PAGE_SIZE = 10;
