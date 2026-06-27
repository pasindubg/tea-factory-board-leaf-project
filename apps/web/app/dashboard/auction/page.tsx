import { requireModuleAccess } from "@/lib/profile";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-stone-100 text-stone-600",
  catalogued: "bg-blue-100 text-blue-800",
  valued: "bg-amber-100 text-amber-800",
  sold: "bg-green-100 text-green-800",
  settled: "bg-green-100 text-green-800",
};

export default async function AuctionSalesPage() {
  const { supabase } = await requireModuleAccess("auction");
  const { data: sales } = await supabase
    .from("auction_sales")
    .select("id, sale_no, sale_date, prompt_date, status, brokers(name)")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-stone-700">Sales</h2>
        <a
          href="/dashboard/auction/new"
          className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
        >
          New sale
        </a>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
              <th className="px-4 py-3">Sale no.</th>
              <th className="px-4 py-3">Broker</th>
              <th className="px-4 py-3">Sale date</th>
              <th className="px-4 py-3">Prompt date</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {(sales ?? []).map((s) => {
              const broker = (s.brokers as unknown as { name: string } | null)?.name ?? "—";
              return (
                <tr key={s.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                  <td className="px-4 py-3 font-medium">
                    <a href={`/dashboard/auction/${s.id}`} className="text-green-700 hover:underline">
                      {s.sale_no}
                    </a>
                  </td>
                  <td className="px-4 py-3">{broker}</td>
                  <td className="px-4 py-3">{s.sale_date ?? "—"}</td>
                  <td className="px-4 py-3">{s.prompt_date ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[s.status] ?? "bg-stone-100 text-stone-600"}`}
                    >
                      {s.status}
                    </span>
                  </td>
                </tr>
              );
            })}
            {(sales ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-stone-400">
                  No sales yet. Create a sale, then enter the lots you invoiced to the broker.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
