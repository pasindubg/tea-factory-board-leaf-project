import { requireModuleAccess } from "@/lib/profile";
import { WarehousesTable, type WarehouseTableRow } from "../settings/warehouses-table";

export default async function WarehousesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const { error } = await searchParams;
  const { data: warehouses } = await supabase.from("auction_warehouses").select("id, name, active").order("name");
  const rows: WarehouseTableRow[] = (warehouses ?? []).map((warehouse) => ({ id: warehouse.id as string, name: warehouse.name as string, active: warehouse.active as boolean }));
  const isOwner = profile.role === "owner";

  return <div className="space-y-5">
    <div><h2 className="text-lg font-medium text-stone-700 dark:text-stone-300">Warehouse Basic Data</h2><p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Maintain the warehouse LOV used for new dispatches. Inactive warehouses stay visible but cannot be selected.</p></div>
    {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
    <WarehousesTable rows={rows} isOwner={isOwner} />
  </div>;
}
