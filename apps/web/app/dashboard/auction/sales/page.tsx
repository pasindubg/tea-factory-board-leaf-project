import Link from "next/link";
import { requireModuleAccess } from "@/lib/profile";

export default async function SalesPage() {
  const { supabase } = await requireModuleAccess("auction");

  const { data: lines } = await supabase
    .from("sale_lines")
    .select(
      "id, lot_id, proceeds, price_per_kg, net_wt, vat_amount, on_guarantee, created_at, " +
        "auction_lots(invoice_no, lot_no, grade, bags, kg_per_bag), " +
        "auction_sales(sale_no), " +
        "buyers(name, vat_no)",
    )
    .order("created_at", { ascending: false });

  const rows = (lines ?? []) as unknown as Array<{
    id: string;
    proceeds: number;
    price_per_kg: number;
    net_wt: number;
    vat_amount: number;
    on_guarantee: boolean;
    created_at: string;
    auction_lots: { invoice_no: string; lot_no: string; grade: string; bags: number; kg_per_bag: number } | null;
    auction_sales: { sale_no: string } | null;
    buyers: { name: string; vat_no: string } | null;
  }>;
  const totalProceeds = rows.reduce((s, l) => s + Number(l.proceeds ?? 0), 0);
  const totalVat = rows.reduce((s, l) => s + Number(l.vat_amount ?? 0), 0);
  const totalNetKg = rows.reduce((s, l) => s + Number(l.net_wt ?? 0), 0);
  const guaranteeCount = rows.filter((l) => l.on_guarantee).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
          <p className="text-xs text-stone-500 dark:text-stone-400">Total sales</p>
          <p className="mt-1 text-2xl font-semibold text-green-800 dark:text-green-400">
            {rows.length}
          </p>
          <p className="text-xs text-stone-400 dark:text-stone-500">lots sold</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
          <p className="text-xs text-stone-500 dark:text-stone-400">Total proceeds</p>
          <p className="mt-1 text-2xl font-semibold text-stone-800 dark:text-stone-200">
            LKR {totalProceeds.toLocaleString("en-LK", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
          <p className="text-xs text-stone-500 dark:text-stone-400">Total VAT</p>
          <p className="mt-1 text-2xl font-semibold text-blue-800 dark:text-blue-400">
            LKR {totalVat.toLocaleString("en-LK", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-stone-400 dark:text-stone-500">{guaranteeCount} on bank guarantee</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
          <p className="text-xs text-stone-500 dark:text-stone-400">Net kg sold</p>
          <p className="mt-1 text-2xl font-semibold text-stone-800 dark:text-stone-200">
            {totalNetKg.toLocaleString("en-LK", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
              <th className="px-4 py-3">Sale no.</th>
              <th className="px-4 py-3">Lot no.</th>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Grade</th>
              <th className="px-4 py-3">Buyer</th>
              <th className="px-4 py-3 text-right">Bags</th>
              <th className="px-4 py-3 text-right">kg/bag</th>
              <th className="px-4 py-3 text-right">Net kg</th>
              <th className="px-4 py-3 text-right">Price/kg</th>
              <th className="px-4 py-3 text-right">Proceeds</th>
              <th className="px-4 py-3 text-right">VAT</th>
              <th className="px-4 py-3">Guarantee</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => {
              const lot = (l.auction_lots as unknown as { invoice_no: string; lot_no: string; grade: string; bags: number; kg_per_bag: number } | null);
              const sale = (l.auction_sales as unknown as { sale_no: string } | null);
              const buyer = (l.buyers as unknown as { name: string; vat_no: string } | null);
              return (
                <tr key={l.id} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
                  <td className="px-4 py-2">
                    <Link href="/dashboard/auction" className="text-green-700 dark:text-green-400 hover:underline">
                      {sale?.sale_no ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{lot?.lot_no ?? "—"}</td>
                  <td className="px-4 py-2 font-medium">{lot?.invoice_no ?? "—"}</td>
                  <td className="px-4 py-2">{lot?.grade ?? "—"}</td>
                  <td className="px-4 py-2">
                    {buyer?.name ?? "—"}
                    {buyer?.vat_no && <span className="ml-1 text-xs text-stone-400 dark:text-stone-500">{buyer.vat_no}</span>}
                  </td>
                  <td className="px-4 py-2 text-right">{lot?.bags ?? "—"}</td>
                  <td className="px-4 py-2 text-right">{lot?.kg_per_bag != null ? Number(lot.kg_per_bag).toFixed(2) : "—"}</td>
                  <td className="px-4 py-2 text-right">{Number(l.net_wt ?? 0).toFixed(2)}</td>
                  <td className="px-4 py-2 text-right">{Number(l.price_per_kg ?? 0).toFixed(2)}</td>
                  <td className="px-4 py-2 text-right font-medium">{Number(l.proceeds ?? 0).toLocaleString("en-LK", { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2 text-right">{Number(l.vat_amount ?? 0).toLocaleString("en-LK", { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${l.on_guarantee ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-400" : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400"}`}>
                      {l.on_guarantee ? "Guarantee" : "Cash"}
                    </span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">
                  No sales yet — confirm a sellers contract to record sales.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
