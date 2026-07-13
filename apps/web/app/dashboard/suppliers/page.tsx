import { requireModuleAccess } from "@/lib/profile";
import { SuppliersTable, type SupplierRow } from "./suppliers-table";

export default async function SuppliersPage() {
  const { supabase } = await requireModuleAccess("suppliers");
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name, phone, area, land_size_acres, active, collectors(name)")
    .order("active", { ascending: false })
    .order("name");

  const rows: SupplierRow[] = (suppliers ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    area: s.area,
    phone: s.phone,
    collectorName: (s.collectors as unknown as { name: string } | null)?.name ?? "—",
    landSizeAcres: s.land_size_acres,
    active: Boolean(s.active),
  }));

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Suppliers</h1>
        <a
          href="/dashboard/suppliers/new"
          className="rounded-md bg-green-700 dark:bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:hover:bg-green-700"
        >
          Add supplier
        </a>
      </div>

      <div className="mt-6">
        <SuppliersTable rows={rows} />
      </div>
    </div>
  );
}
