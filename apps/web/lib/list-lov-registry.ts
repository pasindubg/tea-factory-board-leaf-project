import "server-only";

import { friendlyError } from "@/lib/errors";
import { requireModuleAccess } from "@/lib/profile";
import { applyListPage, splitPage } from "@/lib/list-search-query";
import { isLovSourceKey, LOV_PAGE_SIZE, type LovOption, type LovResult, type LovSourceKey } from "@/lib/list-lov";

/**
 * Server-owned allowlist backing every framework LOV combobox.
 *
 * Same security contract as list-resource-registry.ts: the browser sends a
 * source key and the text the user typed — never a table, a column, a tenant
 * id, or a filter. Each source below names its own table/columns, the query
 * runs through the caller's tenant-scoped client (so RLS still enforces
 * factory isolation), and every source declares the module whose access the
 * caller must already hold.
 */
type LovSourceDefinition = {
  /** Module the caller must be able to reach for this source to resolve. */
  moduleKey: string;
  table: string;
  /** Column stored in the form field (what the mutation receives). */
  valueColumn: string;
  /** Column shown as the option's primary line. */
  labelColumn: string;
  /** Optional secondary line, for disambiguating short codes. */
  descriptionColumn?: string;
  /** Columns matched with `ilike` against the typed text. */
  searchColumns: string[];
  orderBy: { column: string; ascending?: boolean }[];
  /**
   * Fixed equality filters applied to every query for this source. Only use
   * NOT NULL columns here: a NULL never satisfies `eq`, so filtering a
   * nullable flag silently drops rows that were never explicitly set.
   */
  scope?: Record<string, string | number | boolean>;
};

const sources: Record<LovSourceKey, LovSourceDefinition> = {
  "auction.brokers": {
    moduleKey: "auction",
    table: "brokers",
    valueColumn: "id",
    labelColumn: "name",
    descriptionColumn: "vat_no",
    searchColumns: ["name", "vat_no"],
    orderBy: [{ column: "name" }],
  },
  "auction.marks": {
    moduleKey: "auction",
    table: "marks",
    valueColumn: "id",
    labelColumn: "code",
    descriptionColumn: "name",
    searchColumns: ["code", "name"],
    orderBy: [{ column: "code" }],
  },
  "auction.grades": {
    moduleKey: "auction",
    table: "auction_grades",
    // Lots store the grade CODE, not the row id — auction_lots.grade is free
    // text (see packages/db/src/schema/auction-lots.ts), so the code is the
    // value a grade picker must submit.
    valueColumn: "code",
    labelColumn: "code",
    descriptionColumn: "name",
    searchColumns: ["code", "name"],
    orderBy: [{ column: "sort_order" }, { column: "code" }],
    scope: { active: true },
  },
  "auction.buyers": {
    moduleKey: "auction",
    table: "buyers",
    valueColumn: "id",
    labelColumn: "name",
    descriptionColumn: "vat_no",
    searchColumns: ["name", "vat_no"],
    orderBy: [{ column: "name" }],
  },
  "auction.warehouses": {
    moduleKey: "auction",
    table: "auction_warehouses",
    valueColumn: "id",
    labelColumn: "name",
    searchColumns: ["name"],
    orderBy: [{ column: "name" }],
    scope: { active: true },
  },
  "leaf.suppliers": {
    moduleKey: "suppliers",
    table: "suppliers",
    valueColumn: "id",
    labelColumn: "name",
    descriptionColumn: "area",
    searchColumns: ["name", "area", "phone"],
    orderBy: [{ column: "name" }],
  },
  "leaf.collectors": {
    moduleKey: "collectors",
    table: "collectors",
    valueColumn: "id",
    labelColumn: "name",
    descriptionColumn: "area",
    searchColumns: ["name", "area", "phone"],
    orderBy: [{ column: "name" }],
  },
};

// PostgREST's filter mini-language treats , . ( ) as structurally significant,
// and `or()` parses them as separators. None are meaningful in the names and
// codes these sources search, so strip rather than escape — same rationale as
// sanitizeSearchValue in list-search-query.ts.
const POSTGREST_SPECIAL = /[,.()*%]/g;

function sanitizeLovQuery(value: string): string {
  return value.replace(POSTGREST_SPECIAL, " ").trim().slice(0, 100);
}

/**
 * Resolves one allowlisted LOV source with fresh auth and tenant scope.
 * Unknown keys are rejected before any query runs.
 *
 * An empty `query` returns the first page unfiltered, so opening a picker
 * without typing still shows options. `offset` pages through the same result
 * set as the user scrolls the dropdown.
 */
export async function loadLovOptions(sourceKey: unknown, query: unknown, offset: unknown = 0): Promise<LovResult> {
  if (!isLovSourceKey(sourceKey) || !Object.hasOwn(sources, sourceKey)) {
    return { ok: false, error: "Unknown LOV source." };
  }
  const definition = sources[sourceKey];
  const { supabase } = await requireModuleAccess(definition.moduleKey);

  const columns = [
    definition.valueColumn,
    definition.labelColumn,
    ...(definition.descriptionColumn ? [definition.descriptionColumn] : []),
  ];
  // Ordering columns must be selected too — PostgREST rejects ordering by a
  // column absent from the projection.
  for (const order of definition.orderBy) {
    if (!columns.includes(order.column)) columns.push(order.column);
  }

  let request = supabase.from(definition.table).select([...new Set(columns)].join(", "));
  for (const [column, value] of Object.entries(definition.scope ?? {})) {
    request = request.eq(column, value);
  }

  const needle = sanitizeLovQuery(typeof query === "string" ? query : "");
  if (needle) {
    // PREFIX match (`needle*`), not contains (`*needle*`): typing "O" must
    // offer grades that START with O, never BOPF because it happens to
    // contain one. Each searchable column is prefixed independently, so a
    // mark still resolves by either its code or its name.
    request = request.or(definition.searchColumns.map((column) => `${column}.ilike.${needle}*`).join(","));
  }
  for (const order of definition.orderBy) {
    request = request.order(order.column, { ascending: order.ascending ?? true });
  }

  const page = { offset: Math.max(0, Number(offset) || 0), limit: LOV_PAGE_SIZE };
  const { data, error } = await applyListPage(request, page);
  if (error) return { ok: false, error: friendlyError(error) };

  // The projection is built at runtime from the source definition, so
  // supabase-js cannot infer a row shape from the select string and widens it
  // to its error placeholder — same pragmatic cast the list registry uses.
  // applyListPage over-fetches by one so splitPage can report hasMore without
  // a second count query.
  const paged = splitPage((data ?? []) as unknown as Record<string, unknown>[], page.limit);
  const options: LovOption[] = paged.rows.flatMap((row) => {
    const value = row[definition.valueColumn];
    const label = row[definition.labelColumn];
    if (value == null || label == null) return [];
    const description = definition.descriptionColumn ? row[definition.descriptionColumn] : null;
    return [{
      value: String(value),
      label: String(label),
      description: description == null || String(description).trim() === "" ? null : String(description),
    }];
  });
  return { ok: true, options, hasMore: paged.hasMore };
}
