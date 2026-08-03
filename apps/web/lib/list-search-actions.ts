"use server";

import { requireProfile } from "@/lib/profile";
import { friendlyError } from "@/lib/errors";
import { ALL_WEB_ROLES, type Role } from "@/lib/roles";
import type { ListMutationResult } from "@/lib/list-mutations";

const MAX_CRITERIA_KEYS = 50;
const MAX_VALUE_LENGTH = 500;

function sanitizeCriteria(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const entries = Object.entries(input as Record<string, unknown>)
    .filter(([key, value]) => typeof key === "string" && key.length > 0 && key.length < 100 && typeof value === "string")
    .slice(0, MAX_CRITERIA_KEYS)
    .map(([key, value]) => [key, String(value).slice(0, MAX_VALUE_LENGTH)] as const);
  return Object.fromEntries(entries);
}

function isValidListScope(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200;
}

/**
 * Lock management is reserved for a TRUE owner/manager — a custom role built
 * on the manager base (e.g. "Dispatch Manager") must not retain it. The owner
 * narrowed that role deliberately; letting it still administer locks for
 * every role (including itself) would undo that narrowing, mirroring the
 * same "canManageLocks" rule in lib/list-search-state.ts.
 */
async function requireUnrestrictedManager() {
  const { supabase, profile } = await requireProfile(["owner", "manager"]);
  return { supabase, profile, allowed: !profile.access_role_custom };
}

/** Saves the caller's own search criteria for one list instance. Purely personal — never seen by anyone else. */
export async function saveListSearchState(input: {
  listScope: string;
  criteria: Record<string, string>;
  advancedQuery?: string | null;
  sortKey?: string | null;
  sortDir?: "asc" | "desc" | null;
}): Promise<ListMutationResult> {
  if (!isValidListScope(input.listScope)) return { ok: false, error: "Invalid list." };
  const { supabase, profile } = await requireProfile(ALL_WEB_ROLES);

  const { error } = await supabase.from("list_search_states").upsert(
    {
      user_id: profile.id,
      list_scope: input.listScope,
      criteria: sanitizeCriteria(input.criteria),
      advanced_query: input.advancedQuery?.slice(0, MAX_VALUE_LENGTH) ?? null,
      sort_key: input.sortKey ?? null,
      sort_dir: input.sortDir ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,list_scope" },
  );
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true };
}

/**
 * Owner/manager-only: the factory's active custom roles, for the "Lock this
 * search for a role" picker. A plain server action rather than the
 * `users.roles` list resource — that resource is gated to the owner-only
 * Roles & permissions module, but locking a search is available to managers
 * too.
 */
export async function listLockableRoles(): Promise<
  { ok: true; roles: { id: string; name: string; baseRole: string }[] } | { ok: false; error: string }
> {
  const { supabase, allowed } = await requireUnrestrictedManager();
  if (!allowed) return { ok: false, error: "Not permitted." };
  const { data, error } = await supabase
    .from("access_roles")
    .select("id, name, base_role")
    .eq("active", true)
    .order("name");
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, roles: (data ?? []).map((row) => ({ id: row.id as string, name: row.name as string, baseRole: row.base_role as string })) };
}

/**
 * Owner/manager-only: permanently locks specific search field values for one
 * role on one list. Locked keys always win server-side (see
 * lib/list-search-state.ts) regardless of what the client later sends.
 */
export async function saveListSearchLock(input: {
  listScope: string;
  role: { baseRole: Role } | { accessRoleId: string };
  criteria: Record<string, string>;
  advancedQuery?: string | null;
}): Promise<ListMutationResult> {
  if (!isValidListScope(input.listScope)) return { ok: false, error: "Invalid list." };
  const { supabase, profile, allowed } = await requireUnrestrictedManager();
  if (!allowed) return { ok: false, error: "Not permitted." };

  const criteria = sanitizeCriteria(input.criteria);
  const advancedQuery = input.advancedQuery?.trim().slice(0, MAX_VALUE_LENGTH) || null;
  const roleFilter =
    "baseRole" in input.role
      ? { base_role: input.role.baseRole, access_role_id: null }
      : { base_role: null, access_role_id: input.role.accessRoleId };

  let query = supabase.from("list_search_locks").select("id").eq("list_scope", input.listScope);
  query = roleFilter.access_role_id
    ? query.eq("access_role_id", roleFilter.access_role_id)
    : query.eq("base_role", roleFilter.base_role as string).is("access_role_id", null);
  const { data: existing, error: lookupError } = await query.maybeSingle();
  if (lookupError) return { ok: false, error: friendlyError(lookupError) };

  const values = { criteria, advanced_query: advancedQuery, updated_at: new Date().toISOString(), updated_by: profile.id };
  const { error } = existing
    ? await supabase.from("list_search_locks").update(values).eq("id", existing.id as string)
    : await supabase.from("list_search_locks").insert({ list_scope: input.listScope, ...roleFilter, ...values });
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, invalidate: [{ kind: "exact", resource: { key: "framework.search-state", params: { listScope: input.listScope } } }] };
}

/** Owner/manager-only: removes a lock (reverts that role's search back to unrestricted). */
export async function removeListSearchLock(input: { listScope: string; role: { baseRole: Role } | { accessRoleId: string } }): Promise<ListMutationResult> {
  if (!isValidListScope(input.listScope)) return { ok: false, error: "Invalid list." };
  const { supabase, allowed } = await requireUnrestrictedManager();
  if (!allowed) return { ok: false, error: "Not permitted." };

  let query = supabase.from("list_search_locks").delete().eq("list_scope", input.listScope);
  query = "accessRoleId" in input.role ? query.eq("access_role_id", input.role.accessRoleId) : query.eq("base_role", input.role.baseRole).is("access_role_id", null);
  const { error } = await query;
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, invalidate: [{ kind: "exact", resource: { key: "framework.search-state", params: { listScope: input.listScope } } }] };
}
