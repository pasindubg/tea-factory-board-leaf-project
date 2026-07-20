import Link from "next/link";
import { requirePageAccess } from "@/lib/profile";
import { loadListResource } from "@/lib/list-resource-registry";
import { DispatchDetailEditor } from "./dispatch-detail-editor";
import { colomboToday, nextDispatchNo } from "../_actions/_shared";
import { formatFourDigitNo, formatSaleNo } from "../sale-number";

export default async function SaleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ saleId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { supabase, profile } = await requirePageAccess("auction-invoice-detail");
  const isOwner = profile.role === "owner";
  const { saleId } = await params;
  const { error, notice } = await searchParams;

  const { data: sale } = await supabase
    .from("auction_sales")
    .select("id, broker_id, sale_no, target_sale_no, dispatch_date, sale_date, prompt_date, status, selling_mark_id, broker_lorry_no, driver_name, bundled_dispatch_id, created_date, brokers(name)")
    .eq("id", saleId)
    .single();

  if (!sale) {
    return (
      <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-8 text-center text-stone-500 dark:text-stone-400">
        Sale not found.{" "}
        <Link href="/dashboard/auction" className="text-green-700 dark:text-green-400 hover:underline">
          Back to Invoice Overview
        </Link>
      </div>
    );
  }

  const broker = (sale.brokers as unknown as { name: string } | null)?.name ?? "—";
  const [{ data: marks }, { data: grades }, lotResult, { data: saleLines }, dispatchResult, { data: brokers }, nextInvoiceNo] = await Promise.all([
    supabase.from("marks").select("id, code, name").order("code"),
    supabase.from("auction_grades").select("id, code, name").eq("active", true).order("sort_order").order("code"),
    loadListResource({ key: "auction.dispatch-lots", params: { saleId } }),
    supabase.from("sale_lines").select("lot_id").eq("sale_id", saleId),
    loadListResource({ key: "auction.dispatches" }),
    supabase.from("brokers").select("id, name").order("name"),
    nextDispatchNo(supabase),
  ]);
  if (!lotResult.ok) throw new Error(lotResult.error);
  if (!dispatchResult.ok) throw new Error(dispatchResult.error);
  const sellingMark = (marks ?? []).find((mark) => mark.id === (sale as { selling_mark_id?: string | null }).selling_mark_id);
  const currentDispatch = dispatchResult.rows.find((dispatch) => dispatch.id === saleId);

  const soldLotIds = (saleLines ?? []).map((line) => line.lot_id as string).filter(Boolean);

  return (
    <div className="space-y-8">
      {error && <p className="rounded-md bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {notice && <p className="rounded-md bg-green-50 dark:bg-green-950 px-3 py-2 text-sm text-green-800 dark:text-green-400">{notice}</p>}

      <DispatchDetailEditor
        sale={{
          id: sale.id as string,
          sale_no: formatFourDigitNo(sale.sale_no as string | null),
          target_sale_no: formatSaleNo((sale as { target_sale_no?: string | null }).target_sale_no),
          dispatch_date: sale.dispatch_date as string | null,
          sale_date: sale.sale_date as string | null,
          prompt_date: sale.prompt_date as string | null,
          status: sale.status as string | null,
          selling_mark_id: (sale as { selling_mark_id?: string | null }).selling_mark_id ?? null,
          selling_mark: sellingMark ? `${sellingMark.code as string}${sellingMark.name ? ` — ${sellingMark.name as string}` : ""}` : null,
          broker_lorry_no: (sale as { broker_lorry_no?: string | null }).broker_lorry_no ?? null,
          driver_name: (sale as { driver_name?: string | null }).driver_name ?? null,
          bundle_dispatch_no: currentDispatch?.bundle_dispatch_no ?? null,
          created_date: (sale as { created_date?: string | null }).created_date ?? null,
        }}
        dispatches={dispatchResult.rows}
        broker={broker}
        rows={lotResult.rows}
        isOwner={isOwner}
        marks={(marks ?? []).map((m) => ({ id: m.id as string, code: m.code as string, name: m.name as string | null }))}
        grades={(grades ?? []).map((grade) => ({ code: grade.code as string, name: grade.name as string }))}
        soldLotIds={soldLotIds}
        creation={{
          brokers: (brokers ?? []).map((item) => ({ id: item.id as string, name: item.name as string })),
          marks: (marks ?? []).map((item) => ({ id: item.id as string, code: item.code as string, name: item.name as string | null })),
          invoiceDate: colomboToday(),
          nextDispatchNo: nextInvoiceNo,
          dispatchHistory: dispatchResult.rows.map((dispatch) => ({
              saleNo: dispatch.sale_no,
              targetSaleNo: dispatch.target_sale_no,
              dispatchDate: dispatch.dispatch_date,
              saleDate: dispatch.sale_date,
          })),
        }}
      />
    </div>
  );
}
