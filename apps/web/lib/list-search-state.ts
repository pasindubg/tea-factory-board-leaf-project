import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { withTenantDataScope } from "@/lib/tenant-data";
import type { Profile } from "@/lib/profile";
import { filterRowsByAdvancedQuery, filterRowsByCriteria } from "@/lib/list-search-query";

type Supabase = ReturnType<typeof withTenantDataScope> extends infer T ? T : Awaited<ReturnType<typeof createClient>>;

export type ListSearchState = {
  saved: Record<string, string> | null;
  savedAdvancedQuery: string | null;
  locked: Record<string, string>;
  /** A locked role's mandatory advanced-query prefix — see mergeAdvancedQuery. */
  lockedAdvancedQuery: string | null;
  canManageLocks: boolean;
};

/**
 * The one place that resolves "what search state applies to this user, on
 * this list instance" — a user's own saved criteria plus any role lock. Only
 * a TRUE owner/manager (not narrowed by a custom access role) is exempt from
 * locks entirely. A custom role built on top of the manager base role (e.g.
 * "Dispatch Manager") must NOT inherit that exemption — the owner deliberately
 * created a narrower role and must be able to lock its search too, exactly
 * like it already narrows that role's page permissions. Checking
 * `profile.role` alone would let every manager-based custom role bypass any
 * lock set specifically for it, since `profile.role` only ever holds the
 * underlying base role, never the custom role itself. Checking
 * `access_role_id` instead is equally wrong in the opposite direction: every
 * user has one (the seeded "Owner"/"Manager" roles narrow nothing), so that
 * test would strip the owner of lock management — hence `access_role_custom`.
 *
 * `listScope` is the framework's existing per-list-instance key (`EntityList`'s
 * `scope`/`resource.key`); no other identifying information is ever required
 * from the caller.
 */
export async function resolveListSearchState(
  supabase: Supabase,
  profile: Profile,
  listScope: string,
): Promise<ListSearchState> {
  const canManageLocks = (profile.role === "owner" || profile.role === "manager") && !profile.access_role_custom;

  const [savedResult, lockResult] = await Promise.all([
    supabase
      .from("list_search_states")
      .select("criteria, advanced_query")
      .eq("user_id", profile.id)
      .eq("list_scope", listScope)
      .maybeSingle(),
    canManageLocks
      ? Promise.resolve({ data: [] as { base_role: string | null; access_role_id: string | null; criteria: Record<string, string>; advanced_query: string | null }[] })
      : supabase
          .from("list_search_locks")
          .select("base_role, access_role_id, criteria, advanced_query")
          .eq("list_scope", listScope),
  ]);

  const savedRow = savedResult.data as { criteria: Record<string, string> | null; advanced_query: string | null } | null;

  let locked: Record<string, string> = {};
  let lockedAdvancedQuery: string | null = null;
  if (!canManageLocks) {
    const rows = (lockResult.data ?? []) as { base_role: string | null; access_role_id: string | null; criteria: Record<string, string>; advanced_query: string | null }[];
    const byAccessRole = profile.access_role_id ? rows.find((row) => row.access_role_id === profile.access_role_id) : undefined;
    const byBaseRole = rows.find((row) => row.access_role_id === null && row.base_role === profile.role);
    const matched = byAccessRole ?? byBaseRole;
    locked = matched?.criteria ?? {};
    lockedAdvancedQuery = matched?.advanced_query ?? null;
  }

  return {
    saved: savedRow?.criteria ?? null,
    savedAdvancedQuery: savedRow?.advanced_query ?? null,
    locked,
    lockedAdvancedQuery,
    canManageLocks,
  };
}

/**
 * Locked keys always win, regardless of what the client sends — this is the
 * server-side enforcement: a client bypassing the UI and sending its own
 * criteria still gets the locked value. When the caller sends no explicit
 * criteria (the initial mount), the user's own saved criteria apply instead.
 */
export function mergeListCriteria(args: {
  saved: Record<string, string> | null;
  locked: Record<string, string>;
  requested?: Record<string, string>;
}): Record<string, string> {
  const base = args.requested ?? args.saved ?? {};
  return { ...base, ...args.locked };
}

/**
 * A locked advanced query is a mandatory AND-ed prefix, not a replacement —
 * unlike column criteria (where a locked key fully overrides), the locked
 * role can still add its own further terms, which are ANDed onto this one
 * because the query language already ANDs every token together.
 */
export function mergeAdvancedQuery(args: {
  lockedAdvancedQuery: string | null;
  requested?: string | null;
}): string | null {
  const parts = [args.lockedAdvancedQuery, args.requested].map((value) => (value ?? "").trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

/**
 * Server-side search/lock enforcement for a "local" list — a detail-page side
 * panel whose rows are fetched by its own server component rather than through
 * the list-resource registry. Call it in that server component on the rows it
 * is about to pass down: filtering happens before the rows are serialized to
 * the browser, so a locked-away row is never sent at all.
 *
 * Fully generic: it matches criteria keys against the row's own property names
 * (the same keys the search panel already uses), so no call site ever declares
 * a field name, table, or lock rule.
 */
export async function applyServerListSearch<Row>(
  supabase: Supabase,
  profile: Profile,
  listScope: string,
  rows: Row[],
): Promise<Row[]> {
  const state = await resolveListSearchState(supabase, profile, listScope);
  const criteriaFiltered = filterRowsByCriteria(rows, mergeListCriteria({ saved: state.saved, locked: state.locked }));
  const advancedQuery = mergeAdvancedQuery({ lockedAdvancedQuery: state.lockedAdvancedQuery, requested: state.savedAdvancedQuery });
  return filterRowsByAdvancedQuery(criteriaFiltered, advancedQuery);
}
