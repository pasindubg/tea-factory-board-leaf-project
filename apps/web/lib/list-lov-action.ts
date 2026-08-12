"use server";

import type { LovResult } from "@/lib/list-lov";
import { loadLovOptions } from "@/lib/list-lov-registry";

/** The only framework LOV option lookup exposed to client components. */
export async function fetchLovOptions(sourceKey: string, query: string, offset = 0): Promise<LovResult> {
  return loadLovOptions(sourceKey, query, offset);
}
