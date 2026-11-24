import "server-only";
import { requireMobileProfile } from "@/lib/neon/mobile-session";
import { MOBILE_DATA_RESOURCE_ROLES } from "@/lib/roles";
import { dayRange, localDateString } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { mobileRegistrationLineIds } from "@/lib/mobile-driver-lines";
import { linkedMobileCollector, linkedMobileSupplier, mobileError, mobileJson, mobileObject, onlyMobileKeys, type MobileContext } from "@/lib/mobile-app";

export type MobileDataResource = keyof typeof MOBILE_DATA_RESOURCE_ROLES;
const REQUEST_COLUMNS = "id, supplier_id, type_key, amount, status, note, requested_at, handed_at, acknowledged_at";
const TYPE_COLUMNS = "id, key, label, fields, requires_amount, creates_advance, sort_order";
type QueryResult = { data: unknown; error: unknown };
const rows = (result: QueryResult) => {
  if (result.error) throw new Error(friendlyError(result.error as never));
  return result.data ?? [];
};

export async function mobileDriverSupplierIds(caller: MobileContext) {
  const ids = await mobileRegistrationLineIds(caller);
  if (!ids?.length) return [];
  const lines = await caller.supabase.from("lines").select("id").in("id", ids).eq("active", true);
  if (lines.error) throw new Error(friendlyError(lines.error));
  const activeIds = (lines.data ?? []).map((row) => String(row.id));
  if (!activeIds.length) return [];
  const suppliers = await caller.supabase.from("suppliers").select("id").in("line_id", activeIds);
  if (suppliers.error) throw new Error(friendlyError(suppliers.error));
  return (suppliers.data ?? []).map((row) => String(row.id));
}

async function labels(caller: MobileContext) {
  const result = await caller.supabase.from("request_types").select("key, label");
  if (result.error) throw new Error(friendlyError(result.error));
  return Object.fromEntries((result.data ?? []).map((row) => [row.key, row.label]));
}

/** Allowlisted mobile read models: the server owns tables, columns and all
 * actor/tenant predicates. This is not a client-selected query endpoint. */
export async function loadMobileAppResource(request: Request, input: unknown) {
  if (!mobileObject(input) || !onlyMobileKeys(input, ["resource", "params"]) || typeof input.resource !== "string"
    || !Object.hasOwn(MOBILE_DATA_RESOURCE_ROLES, input.resource)) return mobileError("Unknown mobile resource.");
  const resource = input.resource as MobileDataResource;
  const params = input.params ?? {};
  if (!mobileObject(params) || !onlyMobileKeys(params, resource === "supplier.request-type" ? ["key"] : [])) return mobileError("Invalid resource parameters.");
  if (resource === "supplier.request-type" && (typeof params.key !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(params.key))) return mobileError("Choose a valid request type.");
  const caller = await requireMobileProfile(request, MOBILE_DATA_RESOURCE_ROLES[resource]);
  if (caller instanceof Response) return caller;
  const { supabase } = caller;

  if (resource.startsWith("supplier.")) {
    const supplier = await linkedMobileSupplier(caller);
    if (!supplier) return mobileError("This account has no supplier profile.", 403);
    switch (resource) {
      case "supplier.home": {
        const [types, unread] = await Promise.all([
          supabase.from("request_types").select(TYPE_COLUMNS).eq("active", true).order("sort_order"),
          supabase.from("supplier_messages").select("id", { count: "exact", head: true }).eq("supplier_id", supplier.id).is("read_at", null),
        ]);
        if (unread.error) throw new Error(friendlyError(unread.error));
        return mobileJson({ rows: rows(types), unread: unread.count ?? 0 });
      }
      case "supplier.request-type": {
        const result = await supabase.from("request_types").select(TYPE_COLUMNS).eq("key", params.key).eq("active", true).maybeSingle();
        if (result.error) throw new Error(friendlyError(result.error));
        return result.data ? mobileJson({ requestType: result.data }) : mobileError("This request type is no longer available.", 404);
      }
      case "supplier.requests": {
        const [result, typeLabels] = await Promise.all([
          supabase.from("supplier_requests").select(REQUEST_COLUMNS).eq("supplier_id", supplier.id).order("requested_at", { ascending: false }), labels(caller),
        ]);
        return mobileJson({ rows: rows(result), labels: typeLabels });
      }
      case "supplier.messages": {
        const result = await supabase.from("supplier_messages").select("id, supplier_id, title, body, sent_at, read_at")
          .or(`supplier_id.is.null,supplier_id.eq.${supplier.id}`).order("sent_at", { ascending: false });
        return mobileJson({ rows: rows(result) });
      }
    }
  }

  if (resource === "driver.handovers") {
    if (!caller.deviceBound) return mobileError("Sign in on your registered phone to view handovers.", 403);
    const supplierIds = await mobileDriverSupplierIds(caller);
    const typeLabels = await labels(caller);
    if (!supplierIds.length) return mobileJson({ rows: [], labels: typeLabels });
    const result = await supabase.from("supplier_requests").select(`${REQUEST_COLUMNS}, suppliers(name)`)
      .in("supplier_id", supplierIds).in("status", ["approved", "handed_to_driver"]).order("status");
    return mobileJson({ rows: rows(result), labels: typeLabels });
  }

  const collector = await linkedMobileCollector(caller);
  if (!collector) return mobileError("This account has no collector profile.", 403);
  if (resource === "collector.suppliers") {
    const result = await supabase.from("suppliers").select("id, name, area").eq("active", true).order("name");
    return mobileJson({ rows: rows(result) });
  }
  const { start, end } = dayRange(localDateString());
  const result = await supabase.from("weighings").select("id, weight_kg, collected_at, suppliers(name)")
    .eq("collector_id", collector.id).gte("collected_at", start).lt("collected_at", end).order("collected_at", { ascending: false });
  return mobileJson({ rows: rows(result) });
}
