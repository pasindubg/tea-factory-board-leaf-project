import { notFound } from "next/navigation";
import { loadListResource } from "@/lib/list-resource-registry";
import { requirePageAccess } from "@/lib/profile";
import { LineDriversTable } from "./line-drivers-table";

export default async function LineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile } = await requirePageAccess("line-detail");

  const { data: line } = await supabase
    .from("lines")
    .select("id, line_no, name, active, vehicles(vehicle_no, make_model)")
    .eq("id", id)
    .eq("factory_id", profile.factory_id)
    .maybeSingle();
  if (!line) notFound();

  const { count: customerCount } = await supabase
    .from("suppliers")
    .select("id", { count: "exact", head: true })
    .eq("line_id", id)
    .eq("factory_id", profile.factory_id);

  const driverResource = await loadListResource({ key: "leaf.line-drivers", params: { lineId: id } });
  if (!driverResource.ok) throw new Error(driverResource.error);

  const vehicle = line.vehicles as unknown as { vehicle_no: string; make_model: string | null } | null;

  return (
    <div className="flex flex-col gap-6">
      <header className="rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
        <h1 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
          Line {line.line_no}
          {line.name ? <span className="ml-2 font-normal text-stone-500 dark:text-stone-400">{line.name}</span> : null}
        </h1>
        <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-3">
          <Stat label="Vehicle" value={vehicle ? `${vehicle.vehicle_no}${vehicle.make_model ? ` · ${vehicle.make_model}` : ""}` : "—"} />
          <Stat label="Customers" value={String(customerCount ?? 0)} />
          <Stat label="Status" value={line.active ? "Active" : "Inactive"} />
        </dl>
      </header>

      <LineDriversTable lineId={id} rows={driverResource.rows} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">{label}</dt>
      <dd className="mt-0.5 font-medium text-stone-900 dark:text-stone-100">{value}</dd>
    </div>
  );
}
