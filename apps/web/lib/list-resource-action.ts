"use server";

import type { ListRefreshResult } from "@/lib/list-mutations";
import type { ListResourceKey, ListResourceRequest, ListResourceRow } from "@/lib/list-resources";
import { loadListResource } from "@/lib/list-resource-registry";

/** The only framework-list refresh action exposed to client components. */
export async function refreshListResource<Key extends ListResourceKey>(
  request: ListResourceRequest<Key>,
): Promise<ListRefreshResult<ListResourceRow<Key>>> {
  return loadListResource(request);
}
