import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { withTenantDataScope } from "@/lib/tenant-data";
import type { Profile } from "@/lib/profile";
import { filterRowsByCriteria } from "@/lib/list-search-query";

type Supabase = ReturnType<typeof withTenantDataScope> extends infer T ? T : Awaited<ReturnType<typeof createClient>>;

export type ListSearchState = {
  saved: Record<string, string> | null;
  savedAdvancedQuery: string | null;
  locked: Record<string, string>;
  canManageLocks: boolean;
};

/**
 * The one place that resolves "what search state applies to this user, on
 * this list instance" — a user's own saved criteria plus any role lock,
 * owner/manager exempt from locks entirely. `listScope` is the framework's
 * existing per-list-instance key (`EntityList`'s `scope`/`resource.key`); no
 * other identifying information is ever required from the caller.
 */
export async function resolveListSearchState(
  supabase: Supabase,
  profile: Profile,
  listScope: string,
): Promise<ListSearchState> {
  const canManageLocks = profile.role === "owner" || profile.role === "manager";

  const [savedResult, lockResult] = await Promise.all([
    supabase
      .from("list_search_states")
      .select("criteria, advanced_query")
      .eq("user_id", profile.id)
      .eq("list_scope", listScope)
      .maybeSingle(),
    canManageLocks
      ? Promise.resolve({ data: [] as { base_role: string | null; access_role_id: string | null; criteria: Record<string, string> }[] })
      : supabase
          .from("list_search_locks")
          .select("base_role, access_role_id, criteria")
          .eq("list_scope", listScope),
  ]);

  const savedRow = savedResult.data as { criteria: Record<string, string> | null; advanced_query: string | null } | null;

  let locked: Record<string, string> = {};
  if (!canManageLocks) {
    const rows = (lockResult.data ?? []) as { base_role: string | null; access_role_id: string | null; criteria: Record<string, string> }[];
    const byAccessRole = profile.access_role_id ? rows.find((row) => row.access_role_id === profile.access_role_id) : undefined;
    const byBaseRole = rows.find((row) => row.access_role_id === null && row.base_role === profile.role);
    locked = (byAccessRole ?? byBaseRole)?.criteria ?? {};
  }

  return {
    saved: savedRow?.criteria ?? null,
    savedAdvancedQuery: savedRow?.advanced_query ?? null,
    locked,
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
  return filterRowsByCriteria(rows, mergeListCriteria({ saved: state.saved, locked: state.locked }));
}
