import Link from "next/link";
import { requireModuleAccess } from "@/lib/profile";
import {
  addDispatchedLot,
} from "../actions";
import { DispatchDetailEditor } from "./dispatch-detail-editor";

export default async function SaleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ saleId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const isOwner = profile.role === "owner";
  const { saleId } = await params;
  const { error, notice } = await searchParams;

  const { data: sale } = await supabase
    .from("auction_sales")
    .select("id, sale_no, target_sale_no, dispatch_date, sale_date, prompt_date, status, brokers(name)")
    .eq("id", saleId)
    .single();

  if (!sale) {
    return (
      <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-8 text-center text-stone-500 dark:text-stone-400">
        Sale not found.{" "}
        <Link href="/dashboard/auction" className="text-green-700 dark:text-green-400 hover:underline">
          Back to Dispatches Overview
        </Link>
      </div>
    );
  }

  const broker = (sale.brokers as unknown as { name: string } | null)?.name ?? "—";
  const [{ data: marks }, { data: lots }, { data: saleLines }] = await Promise.all([
    supabase.from("marks").select("id, code, name").order("code"),
    supabase
      .from("auction_lots")
      .select(
        "id, invoice_no, lot_no, grade, bags, kg_per_bag, net_wt, state, shutout_reason, lot_source, marks(code), lot_invoices(invoice_no)",
      )
      .eq("sale_id", saleId)
      .order("invoice_no"),
    supabase.from("sale_lines").select("lot_id").eq("sale_id", saleId),
  ]);

  const rows = lots ?? [];
  const soldLotIds = (saleLines ?? []).map((line) => line.lot_id as string).filter(Boolean);

  return (
    <div className="space-y-8">
      {error && <p className="rounded-md bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {notice && <p className="rounded-md bg-green-50 dark:bg-green-950 px-3 py-2 text-sm text-green-800 dark:text-green-400">{notice}</p>}

      <DispatchDetailEditor
        sale={{
          id: sale.id as string,
          sale_no: sale.sale_no as string | null,
          target_sale_no: (sale as { target_sale_no?: string | null }).target_sale_no ?? null,
          dispatch_date: sale.dispatch_date as string | null,
          sale_date: sale.sale_date as string | null,
          prompt_date: sale.prompt_date as string | null,
          status: sale.status as string | null,
        }}
        broker={broker}
        rows={rows.map(l => ({
          id: l.id as string,
          invoice_no: l.invoice_no as string | null,
          lot_no: l.lot_no as string | null,
          grade: l.grade as string | null,
          bags: l.bags as number | null,
          kg_per_bag: l.kg_per_bag as number | null,
          net_wt: l.net_wt as number | string | null,
          state: l.state as string | null,
          shutout_reason: l.shutout_reason as string | null,
          lot_source: (l as { lot_source?: string | null }).lot_source ?? "factory",
          marks: (l.marks as unknown as { code: string; name: string } | null) ?? null,
          lot_invoices: (l.lot_invoices as unknown as { invoice_no: string }[] | null) ?? null,
        }))}
        isOwner={isOwner}
        marks={(marks ?? []).map((m) => ({ id: m.id as string, code: m.code as string, name: m.name as string }))}
        addAction={addDispatchedLot.bind(null, sale.id)}
        soldLotIds={soldLotIds}
      />
    </div>
  );
}
