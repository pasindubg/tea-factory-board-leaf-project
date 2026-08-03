import type { ListInvalidation } from "@/lib/list-resources";

export type ListMutationResult =
  | { ok: true; notice?: string; invalidate?: ListInvalidation[] }
  | { ok: false; error: string };

/**
 * `hasMore`/`nextOffset` are only meaningful for resources that declare
 * a `search` config (true server-side pagination); other resources always
 * return their full row set with `hasMore: false`, exactly as before.
 * `locked`/`canManageLocks` let the client render disabled search fields and
 * the owner/manager-only inline lock control without duplicating role logic.
 */
export type ListRefreshResult<T> =
  | {
      ok: true;
      rows: T[];
      hasMore?: boolean;
      nextOffset?: number;
      savedCriteria?: Record<string, string>;
      savedAdvancedQuery?: string | null;
      locked?: Record<string, string>;
      lockedAdvancedQuery?: string | null;
      canManageLocks?: boolean;
    }
  | { ok: false; error: string };
