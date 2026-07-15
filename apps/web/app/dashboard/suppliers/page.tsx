import { friendlyError } from "@/lib/errors";
import { loadListResource } from "@/lib/list-resource-registry";
import { requireModuleAccess } from "@/lib/profile";
import { SuppliersTable, type CollectorOption } from "./suppliers-table";

export default async function SuppliersPage() {
  const { supabase, profile } = await requireModuleAccess("suppliers");
  const [supplierResource, { data: collectors, error: collectorError }] = await Promise.all([
    loadListResource({ key: "leaf.suppliers" }),
    supabase
      .from("collectors")
      .select("id, name, active")
      .eq("factory_id", profile.factory_id)
      .order("active", { ascending: false })
      .order("name"),
  ]);
  if (!supplierResource.ok) throw new Error(supplierResource.error);
  if (collectorError) throw new Error(friendlyError(collectorError));

  const collectorOptions: CollectorOption[] = (collectors ?? []).map((collector) => ({
    id: collector.id,
    name: collector.name,
    active: Boolean(collector.active),
  }));

  return <SuppliersTable rows={supplierResource.rows} collectors={collectorOptions} />;
}
