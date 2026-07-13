import { requireModuleAccess } from "@/lib/profile";
import { CollectorsTable, type CollectorRow } from "./collectors-table";

export default async function CollectorsPage() {
  const { supabase } = await requireModuleAccess("collectors");
  const { data: collectors } = await supabase
    .from("collectors")
    .select("id, name, phone, nic_number, area, active")
    .order("active", { ascending: false })
    .order("name");

  const rows: CollectorRow[] = (collectors ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    area: c.area,
    phone: c.phone,
    nicNumber: c.nic_number,
    active: Boolean(c.active),
  }));

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Collectors</h1>
        <a
          href="/dashboard/collectors/new"
          className="rounded-md bg-green-700 dark:bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:hover:bg-green-700"
        >
          Add collector
        </a>
      </div>

      <div className="mt-6">
        <CollectorsTable rows={rows} />
      </div>
    </div>
  );
}
