import Link from "next/link";
import { requireModuleAccess } from "@/lib/profile";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400",
  catalogued: "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-400",
  valued: "bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-400",
  sold: "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-400",
  settled: "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-400",
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
        <h2 className="text-lg font-medium text-stone-700 dark:text-stone-300">Sales</h2>
        <Link
          href="/dashboard/auction/new"
          className="rounded-md bg-green-700 dark:bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:hover:bg-green-700"
        >
          New sale
        </Link>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
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
                <tr key={s.id} className="border-b border-stone-100 dark:border-stone-800 last:border-0 hover:bg-stone-50 dark:hover:bg-stone-800">
                  <td className="px-4 py-3 font-medium">
                    <a href={`/dashboard/auction/${s.id}`} className="text-green-700 dark:text-green-400 hover:underline">
                      {s.sale_no}
                    </a>
                  </td>
                  <td className="px-4 py-3">{broker}</td>
                  <td className="px-4 py-3">{s.sale_date ?? "—"}</td>
                  <td className="px-4 py-3">{s.prompt_date ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[s.status] ?? "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400"}`}
                    >
                      {s.status}
                    </span>
                  </td>
                </tr>
              );
            })}
            {(sales ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">
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
