import { requireModuleAccess } from "@/lib/profile";
import { loadListResource } from "@/lib/list-resource-registry";
import { WarehousesTable, type WarehouseTableRow } from "../settings/warehouses-table";

export default async function WarehousesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { profile } = await requireModuleAccess("auction");
  const { error } = await searchParams;
  const warehouses = await loadListResource({ key: "auction.warehouses" });
  if (!warehouses.ok) throw new Error(warehouses.error);
  const rows: WarehouseTableRow[] = warehouses.rows;
  const isOwner = profile.role === "owner";

  return <div className="space-y-5">
    <div><h2 className="text-lg font-medium text-stone-700 dark:text-stone-300">Warehouse Basic Data</h2><p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Maintain the warehouse LOV used for new dispatches. Inactive warehouses stay visible but cannot be selected.</p></div>
    {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
    <WarehousesTable rows={rows} isOwner={isOwner} />
  </div>;
}
