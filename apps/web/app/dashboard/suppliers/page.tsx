import { requireProfile } from "@/lib/profile";
import { setSupplierActive } from "./actions";

export default async function SuppliersPage() {
  const { supabase } = await requireProfile();
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name, phone, area, land_size_acres, active, collectors(name)")
    .order("active", { ascending: false })
    .order("name");

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Suppliers</h1>
        <a
          href="/dashboard/suppliers/new"
          className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
        >
          Add supplier
        </a>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Area</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Collector</th>
              <th className="px-4 py-3">Land (acres)</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {(suppliers ?? []).map((s) => {
              const collectorName = (s.collectors as unknown as { name: string } | null)?.name ?? "—";
              return (
                <tr key={s.id} className="border-b border-stone-100 last:border-0">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3">{s.area ?? "—"}</td>
                  <td className="px-4 py-3">{s.phone ?? "—"}</td>
                  <td className="px-4 py-3">{collectorName}</td>
                  <td className="px-4 py-3">{s.land_size_acres ?? "—"}</td>
                  <td className="px-4 py-3">
                    {s.active ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">active</span>
                    ) : (
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <a href={`/dashboard/suppliers/${s.id}/edit`} className="text-green-700 hover:underline">
                        Edit
                      </a>
                      <form action={setSupplierActive.bind(null, s.id, !s.active)}>
                        <button className="text-stone-500 hover:underline">
                          {s.active ? "Deactivate" : "Reactivate"}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
            {(suppliers ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-stone-400">
                  No suppliers yet. Add your first supplier to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
