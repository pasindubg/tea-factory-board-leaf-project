import "server-only";
import { hasOrBranches, splitAdvancedQueryGroups } from "./list-query-groups";

/**
 * Generic server-side search/pagination for framework list resources. One
 * shared implementation — resources declare which of their own columns are
 * searchable (a plain data map, not code), never how to search them.
 */

/**
 * How a criterion is pushed into SQL. This is driven by the COLUMN'S TYPE, not
 * by preference, because Postgres rejects or silently mismatches the wrong one:
 *   contains — `ilike`. TEXT COLUMNS ONLY. On any other type Postgres raises
 *              "operator does not exist: <type> ~~* unknown" and the list 400s.
 *   equals   — `eq`. Safe on every type (text, numeric, boolean, date).
 *   day      — `gte`/`lt` across one calendar day. Required for timestamp
 *              columns: `eq` with a bare YYYY-MM-DD matches midnight exactly,
 *              so it returns zero rows with no error — a silent wrong answer.
 */
export type SearchColumnMode = "contains" | "equals" | "day";
export type SearchableColumn = {
  /** Filter target. For a joined column use the embedded path, e.g. "suppliers.name". */
  column: string;
  mode: SearchColumnMode;
  /**
   * Embedded table this column lives on. PostgREST left-joins by default, where
   * filtering an embedded column nulls the embed instead of excluding the parent
   * row — so a resource whose embed is nullable must switch that embed to
   * `!inner` while a criterion on it is active. See activeEmbeds below.
   */
  embed?: string;
};
export type ListSearchCriteria = Record<string, string>;

/**
 * Per-resource search config. Most UI search keys are just the base table's own
 * column in camelCase, so they are mapped automatically (weightKg -> weight_kg)
 * and need no declaration. Only the two exceptions are declared:
 *   `columns`  — keys whose value lives somewhere else (a joined table).
 *   `computed` — keys built in JS that have no SQL column at all; these are
 *                never pushed into the query and fall through to the row-level
 *                filter in loadListResource, which still enforces them.
 */
export type ResourceSearchConfig = {
  columns?: Record<string, SearchableColumn>;
  computed?: readonly string[];
};

function toSnakeCase(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

/**
 * Resolves one UI search key to the column to filter on, or null if it cannot
 * be pushed into SQL.
 *
 * The convention (no declaration needed) assumes a TEXT column on the base
 * table, matched with `contains`. Any column that is not text — timestamp,
 * date, numeric, boolean — MUST be declared in `columns` with the right mode,
 * because `ilike` on those types errors out (see SearchColumnMode).
 */
export function resolveSearchColumn(key: string, config: ResourceSearchConfig): SearchableColumn | null {
  const explicit = config.columns?.[key];
  if (explicit) return explicit;
  if (config.computed?.includes(key)) return null;
  return { column: toSnakeCase(key), mode: "contains" };
}

/** Start/end of the calendar day a YYYY-MM-DD value names, for `day` mode. */
function dayBounds(value: string): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const end = new Date(`${value}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: `${value}T00:00:00`, end: `${end.toISOString().slice(0, 10)}T00:00:00` };
}

export type ListSearchPage = { offset?: number; limit?: number };

export const DEFAULT_LIST_PAGE_SIZE = 100;

// PostgREST's filter mini-language treats , . ( ) as structurally significant.
// None of these are meaningful in the free-text/column values this app
// searches (names, codes, notes), so strip them rather than escape them.
const POSTGREST_SPECIAL = /[,.()]/g;

function sanitizeSearchValue(value: string): string {
  return value.replace(POSTGREST_SPECIAL, " ").trim();
}

// This module deliberately stays structurally loose (matching this
// registry's existing pragmatic-cast style, see list-resource-registry.ts):
// supabase-js's query builder returns a different subtype at each pipeline
// stage (filter -> order -> range), so a single precise generic type across
// all three helpers below would fight the real supabase-js type hierarchy
// for no real safety gain. Each function's own JSDoc states what it needs.
type QueryBuilder = {
  ilike(column: string, pattern: string): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  gt(column: string, value: unknown): QueryBuilder;
  gte(column: string, value: unknown): QueryBuilder;
  lt(column: string, value: unknown): QueryBuilder;
  lte(column: string, value: unknown): QueryBuilder;
  neq(column: string, value: unknown): QueryBuilder;
  /** PostgREST negation: `.not(col, "ilike", "%x%")`. */
  not(column: string, operator: string, value: unknown): QueryBuilder;
  or(filters: string): QueryBuilder;
  range(from: number, to: number): QueryBuilder;
};

/** Applies each `{ key: value }` criterion that can be pushed into SQL. Call before `.order()`. */
export function applyListFilters<Q>(query: Q, criteria: ListSearchCriteria | undefined, config: ResourceSearchConfig): Q {
  let result = query as unknown as QueryBuilder;
  for (const [key, rawValue] of Object.entries(criteria ?? {})) {
    const value = sanitizeSearchValue(rawValue ?? "");
    if (!value) continue;
    const target = resolveSearchColumn(key, config);
    if (!target) continue;
    if (target.mode === "day") {
      const bounds = dayBounds(value);
      if (bounds) result = result.gte(target.column, bounds.start).lt(target.column, bounds.end);
      continue;
    }
    result = target.mode === "equals" ? result.eq(target.column, value) : result.ilike(target.column, `%${value}%`);
  }
  return result as unknown as Q;
}

export function tokeniseAdvancedQuery(query: string): string[] {
  return query.match(/"[^"]+"|\S+/g)?.map((token) => token.replace(/^"|"$/g, "")) ?? [];
}

/**
 * `key<op>value`, with the longer operators first so `!=` is not read as a key
 * ending in `!`. Must stay in step with the browser-side pattern in
 * list-controls.tsx: the panel filters what you can see, this filters what the
 * server will return, and the two disagreeing is a wrong answer, not a slow one.
 *
 * Keys here are column keys only — the panel rewrites labels to keys before the
 * query is ever sent (canonicaliseAdvancedQuery).
 */
const ADVANCED_TOKEN = /^([a-zA-Z0-9_]+)(>=|<=|!=|!:|=|>|<|:)(.+)$/;

/**
 * Embedded tables that currently carry a filter, and therefore must be joined
 * with `!inner` so non-matching parent rows are excluded rather than returned
 * with a nulled embed. Only matters for nullable relationships; a NOT NULL FK
 * can always be `!inner`.
 */
export function activeEmbeds(
  criteria: ListSearchCriteria | undefined,
  advancedQuery: string | null | undefined,
  config: ResourceSearchConfig,
): Set<string> {
  const active = new Set<string>();
  for (const [key, value] of Object.entries(criteria ?? {})) {
    const embed = config.columns?.[key]?.embed;
    if (embed && (value ?? "").trim()) active.add(embed);
  }
  // An OR query pushes nothing into SQL (see applyAdvancedQuery), so nothing
  // needs `!inner` on its account — and forcing it would EXCLUDE rows whose
  // nullable embed is empty, narrowing the result for a filter that was never
  // applied.
  if (!hasOrBranches(advancedQuery)) {
    for (const token of tokeniseAdvancedQuery(advancedQuery ?? "")) {
      const key = token.match(/^([a-zA-Z0-9_]+)(?:>=|<=|!=|!:|=|>|<|:)/)?.[1];
      const embed = key ? config.columns?.[key]?.embed : undefined;
      if (embed) active.add(embed);
    }
  }
  return active;
}

/** `embed(cols)` → `embed!inner(cols)` when that embed currently carries a filter. */
export function embedSelect(select: string, embeds: Set<string>): string {
  let result = select;
  for (const embed of embeds) {
    result = result.replace(new RegExp(`(^|[\\s,])${embed}\\(`, "g"), `$1${embed}!inner(`);
  }
  return result;
}

/**
 * Applies the same `key:value` / `key>value` / free-text mini query language
 * ListSearchPanel offers, translated into real filters instead of an in-memory
 * row scan. Free-text tokens OR-match across every declared searchable column.
 */
export function applyAdvancedQuery<Q>(query: Q, advancedQuery: string | null | undefined, config: ResourceSearchConfig): Q {
  if (!advancedQuery?.trim()) return query;
  // An OR query is deliberately NOT pushed down. Every term here is ANDed onto
  // the request, so pushing one branch would exclude rows the other branch
  // should have returned — a wrong answer, not a slow one. The row-level filter
  // enforces the whole expression instead; it sees the same query and is the
  // authority for computed columns anyway.
  if (hasOrBranches(advancedQuery)) return query;
  let result = query as unknown as QueryBuilder;
  // A bare token OR-matches across the explicitly declared non-embedded
  // columns. Embedded columns are excluded because PostgREST's top-level `or`
  // cannot reference a foreign table — including one errors the whole request
  // rather than matching more rows. Auto-mapped keys are not guessed at here:
  // a free-text token names no column, so there is nothing to derive from.
  const columns = Object.values(config.columns ?? {}).filter((c) => !c.embed).map((c) => c.column);

  for (const token of tokeniseAdvancedQuery(advancedQuery)) {
    const match = token.match(ADVANCED_TOKEN);
    if (match) {
      const [, key, op, rawValue] = match;
      const target = resolveSearchColumn(key, config);
      const value = sanitizeSearchValue(rawValue);
      if (target && value) {
        if (op === ":") result = result.ilike(target.column, `%${value}%`);
        else if (op === "!:") result = result.not(target.column, "ilike", `%${value}%`);
        else if (op === "=") result = result.eq(target.column, value);
        else if (op === "!=") result = result.neq(target.column, value);
        else if (!Number.isNaN(Number(value))) {
          const num = Number(value);
          result =
            op === ">" ? result.gt(target.column, num)
            : op === ">=" ? result.gte(target.column, num)
            : op === "<" ? result.lt(target.column, num)
            : result.lte(target.column, num);
        }
        continue;
      }
    }
    const value = sanitizeSearchValue(token);
    if (!value || columns.length === 0) continue;
    result = result.or(columns.map((col) => `${col}.ilike.%${value}%`).join(","));
  }
  return result as unknown as Q;
}

/** Fetches one extra row so the caller can tell whether there's another page without a second round trip. */
export function applyListPage<Q>(query: Q, page: ListSearchPage): Q {
  const limit = page.limit ?? DEFAULT_LIST_PAGE_SIZE;
  const offset = page.offset ?? 0;
  return (query as unknown as QueryBuilder).range(offset, offset + limit) as unknown as Q;
}

export function splitPage<Row>(rows: Row[], limit = DEFAULT_LIST_PAGE_SIZE): { rows: Row[]; hasMore: boolean } {
  const hasMore = rows.length > limit;
  return { rows: hasMore ? rows.slice(0, limit) : rows, hasMore };
}

/**
 * Row-level fallback filter, applied server-side to every resource's output
 * regardless of whether it declares a `search` config — real enforcement (the
 * client never receives a row that doesn't match) for resources whose loader
 * can't push filtering into SQL (computed/aggregated views). Matches by the
 * row's own property name, so it needs no per-resource declaration.
 */
/**
 * Every form a row property can be searched by. A boolean answers to the Yes/No
 * the column renders AND to true/false, so a boolean column needs no companion
 * label field and a criterion saved before this existed still matches.
 */
function rowTexts(value: unknown): string[] {
  if (typeof value === "boolean") return value ? ["yes", "true"] : ["no", "false"];
  return [String(value ?? "").toLowerCase()];
}

function rowContains(value: unknown, needle: string): boolean {
  return rowTexts(value).some((text) => text.includes(needle));
}

function rowEquals(value: unknown, needle: string): boolean {
  return rowTexts(value).some((text) => text === needle);
}

export function filterRowsByCriteria<Row>(rows: Row[], criteria: ListSearchCriteria | undefined): Row[] {
  const entries = Object.entries(criteria ?? {}).filter(([, value]) => (value ?? "").trim() !== "");
  if (entries.length === 0) return rows;
  return rows.filter((row) =>
    entries.every(([key, value]) => {
      const raw = (row as Record<string, unknown>)[key];
      return rowContains(raw, value.toLowerCase());
    }),
  );
}

/**
 * Row-level advanced-query filter — the same `key:value`/`key>value`/free-text
 * mini language as `applyAdvancedQuery`, but matched against a row's own
 * properties in memory instead of pushed into SQL. This is what gives a
 * locked advanced query real enforcement for local/aggregated lists (the ones
 * that can't push a `search` config into SQL), exactly like
 * `filterRowsByCriteria` already does for locked column criteria.
 */
export function filterRowsByAdvancedQuery<Row>(rows: Row[], advancedQuery: string | null | undefined): Row[] {
  const branches = splitAdvancedQueryGroups(advancedQuery).map(tokeniseAdvancedQuery);
  if (branches.length === 0) return rows;
  // A row survives if ANY `|` branch matches; within a branch every term must.
  return rows.filter((row) =>
    branches.some((tokens) => tokens.every((token) => matchesRowToken(row, token))),
  );
}

function matchesRowToken(row: unknown, token: string): boolean {
  const record = row as Record<string, unknown>;
  const match = token.match(ADVANCED_TOKEN);
  if (match) {
    const [, key, op, rawValue] = match;
    if (Object.hasOwn(record, key)) {
      const raw = record[key];
      const value = rawValue.trim();
      if (op === ":") return rowContains(raw, value.toLowerCase());
      if (op === "!:") return !rowContains(raw, value.toLowerCase());
      if (op === "=") return rowEquals(raw, value.toLowerCase());
      if (op === "!=") return !rowEquals(raw, value.toLowerCase());
      const left = Number(raw);
      const right = Number(value);
      if (Number.isNaN(left) || Number.isNaN(right)) return false;
      if (op === ">") return left > right;
      if (op === ">=") return left >= right;
      if (op === "<") return left < right;
      return left <= right;
    }
    // Unknown key on this row shape — fall through and treat the whole token
    // as free text rather than silently matching everything.
  }
  const needle = token.toLowerCase();
  return Object.values(record).some((value) => rowContains(value, needle));
}
