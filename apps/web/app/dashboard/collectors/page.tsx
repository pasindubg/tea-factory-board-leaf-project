import { requireModuleAccess } from "@/lib/profile";
import { SubmitButton } from "@/components/submit-button";
import { setCollectorActive } from "./actions";

export default async function CollectorsPage() {
  const { supabase } = await requireModuleAccess("collectors");
  const { data: collectors } = await supabase
    .from("collectors")
    .select("id, name, phone, nic_number, area, active")
    .order("active", { ascending: false })
    .order("name");

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Collectors</h1>
        <a
          href="/dashboard/collectors/new"
          className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
        >
          Add collector
        </a>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Area</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">NIC</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {(collectors ?? []).map((c) => (
              <tr key={c.id} className="border-b border-stone-100 last:border-0">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3">{c.area ?? "—"}</td>
                <td className="px-4 py-3">{c.phone ?? "—"}</td>
                <td className="px-4 py-3">{c.nic_number ?? "—"}</td>
                <td className="px-4 py-3">
                  {c.active ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">active</span>
                  ) : (
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">inactive</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <a href={`/dashboard/collectors/${c.id}/edit`} className="text-green-700 hover:underline">
                      Edit
                    </a>
                    <form action={setCollectorActive.bind(null, c.id, !c.active)}>
                      <SubmitButton pendingText="…" className="text-stone-500 hover:underline">
                        {c.active ? "Deactivate" : "Reactivate"}
                      </SubmitButton>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {(collectors ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-stone-400">
                  No collectors yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
