import type { ListInvalidation } from "@/lib/list-resources";

export type ListMutationResult =
  | { ok: true; notice?: string; invalidate?: ListInvalidation[] }
  | { ok: false; error: string };

export type ListRefreshResult<T> =
  | { ok: true; rows: T[] }
  | { ok: false; error: string };
