import Link from "next/link";
import { requireModuleAccess } from "@/lib/profile";
import {
  addDispatchedLot,
} from "../actions";
import { DispatchDetailEditor } from "./dispatch-detail-editor";
import { formatFourDigitNo, formatSaleNo } from "../sale-number";

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
    .select("id, broker_id, sale_no, target_sale_no, dispatch_date, sale_date, prompt_date, status, brokers(name)")
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
  const [{ data: marks }, { data: grades }, { data: lots }, { data: saleLines }, { data: thresholds }, { data: dispatches }] = await Promise.all([
    supabase.from("marks").select("id, code, name").order("code"),
    supabase.from("auction_grades").select("id, code, name").eq("active", true).order("sort_order").order("code"),
    supabase
      .from("auction_lots")
      .select(
        "id, invoice_no, lot_no, grade, bags, kg_per_bag, sample_allowance, net_wt, state, shutout_reason, lot_source, marks(code), lot_invoices(invoice_no)",
      )
      .eq("sale_id", saleId)
      .order("invoice_no"),
    supabase.from("sale_lines").select("lot_id").eq("sale_id", saleId),
    supabase
      .from("broker_grade_thresholds")
      .select("min_net_kg, applies, auction_grades(code)")
      .eq("broker_id", sale.broker_id as string),
    supabase
      .from("auction_sales")
      .select("id, sale_no, target_sale_no, dispatch_date, sale_date, status, brokers(name)")
      .order("sale_no", { ascending: false }),
  ]);

  const rows = lots ?? [];
  const soldLotIds = (saleLines ?? []).map((line) => line.lot_id as string).filter(Boolean);
  const thresholdByGrade = new Map<string, { minNetKg: number; applies: boolean }>();
  for (const threshold of (thresholds ?? []) as unknown as {
    min_net_kg: string | number;
    applies: boolean;
    auction_grades: { code: string }[] | { code: string } | null;
  }[]) {
    const gradeRef = Array.isArray(threshold.auction_grades) ? threshold.auction_grades[0] : threshold.auction_grades;
    if (gradeRef?.code) {
      thresholdByGrade.set(gradeRef.code, {
        minNetKg: Number(threshold.min_net_kg),
        applies: threshold.applies,
      });
    }
  }

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
        }}
        dispatches={(dispatches ?? []).map((dispatch) => ({
          id: dispatch.id as string,
          sale_no: formatFourDigitNo(dispatch.sale_no as string | null),
          target_sale_no: formatSaleNo((dispatch as { target_sale_no?: string | null }).target_sale_no),
          broker: (dispatch.brokers as unknown as { name: string } | null)?.name ?? "—",
          dispatch_date: dispatch.dispatch_date as string | null,
          sale_date: dispatch.sale_date as string | null,
          status: dispatch.status as string | null,
        }))}
        broker={broker}
        rows={rows.map(l => ({
          ...(() => {
            const threshold = thresholdByGrade.get((l.grade as string | null) ?? "");
            return {
              threshold_min_net_kg: threshold ? threshold.minNetKg : null,
              threshold_applies: threshold?.applies ?? false,
            };
          })(),
          id: l.id as string,
          invoice_no: formatFourDigitNo(l.invoice_no as string | null),
          lot_no: formatFourDigitNo(l.lot_no as string | null),
          grade: l.grade as string | null,
          bags: l.bags as number | null,
          kg_per_bag: l.kg_per_bag as number | null,
          sample_allowance: l.sample_allowance as number | string | null,
          net_wt: l.net_wt as number | string | null,
          state: l.state as string | null,
          shutout_reason: l.shutout_reason as string | null,
          lot_source: (l as { lot_source?: string | null }).lot_source ?? "factory",
          marks: (l.marks as unknown as { code: string; name: string } | null) ?? null,
          lot_invoices: ((l.lot_invoices as unknown as { invoice_no: string }[] | null) ?? null)?.map((invoice) => ({
            invoice_no: formatFourDigitNo(invoice.invoice_no),
          })) ?? null,
        }))}
        isOwner={isOwner}
        marks={(marks ?? []).map((m) => ({ id: m.id as string, code: m.code as string, name: m.name as string }))}
        grades={(grades ?? []).map((grade) => ({ code: grade.code as string, name: grade.name as string }))}
        addAction={addDispatchedLot.bind(null, sale.id)}
        soldLotIds={soldLotIds}
      />
    </div>
  );
}
