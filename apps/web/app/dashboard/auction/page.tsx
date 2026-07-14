import { requireModuleAccess } from "@/lib/profile";
import { DispatchesTable } from "./dispatches-table";
import { NewDispatchForm } from "./new-dispatch-form";
import { colomboToday, nextDispatchNo } from "./_actions/_shared";
import { formatFourDigitNo, formatSaleNo } from "./sale-number";

export default async function AuctionSalesPage() {
  const { supabase, profile } = await requireModuleAccess("auction");
  const isOwner = profile.role === "owner";
  const [{ data: sales }, { data: brokers }, { data: marks }, { data: bundles }] = await Promise.all([
    supabase
      .from("auction_sales")
      .select("id, sale_no, target_sale_no, dispatch_date, sale_date, prompt_date, status, selling_mark_id, broker_lorry_no, driver_name, bundled_dispatch_id, brokers(name)")
      .eq("sale_kind", "dispatch")
      .order("created_at", { ascending: false }),
    supabase.from("brokers").select("id, name").order("name"),
    supabase.from("marks").select("id, code, name").order("code"),
    supabase.from("auction_bundled_dispatches").select("id, dispatch_no"),
  ]);
  const markById = new Map((marks ?? []).map((mark) => [mark.id as string, `${mark.code as string}${mark.name ? ` — ${mark.name as string}` : ""}`]));
  const bundleNoById = new Map((bundles ?? []).map((bundle) => [bundle.id as string, formatFourDigitNo(bundle.dispatch_no as string)]));

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-stone-700 dark:text-stone-300">Invoice Overview</h2>
        <NewDispatchForm
          brokers={brokers ?? []}
          marks={(marks ?? []).map((mark) => ({ id: mark.id as string, code: mark.code as string, name: mark.name as string | null }))}
          invoiceDate={colomboToday()}
          nextDispatchNo={await nextDispatchNo(supabase)}
          dispatchHistory={(sales ?? []).map((s) => ({
            saleNo: formatFourDigitNo(s.sale_no as string),
            targetSaleNo: formatSaleNo((s as unknown as { target_sale_no?: string }).target_sale_no),
            dispatchDate: (s as unknown as { dispatch_date?: string }).dispatch_date ?? null,
            saleDate: (s.sale_date as string | undefined) ?? null,
          }))}
        />
      </div>

      <div className="mt-4">
        <DispatchesTable
          sales={(sales ?? []).map((s) => ({
            id: s.id as string,
            sale_no: formatFourDigitNo(s.sale_no as string),
            target_sale_no: formatSaleNo((s as unknown as { target_sale_no?: string }).target_sale_no),
            dispatch_date: (s as unknown as { dispatch_date?: string }).dispatch_date,
            sale_date: s.sale_date as string | undefined,
            prompt_date: s.prompt_date as string | undefined,
            status: s.status as string,
            selling_mark: markById.get((s as { selling_mark_id?: string | null }).selling_mark_id ?? "") ?? null,
            broker_lorry_no: (s as { broker_lorry_no?: string | null }).broker_lorry_no ?? null,
            driver_name: (s as { driver_name?: string | null }).driver_name ?? null,
            bundle_dispatch_no: bundleNoById.get((s as { bundled_dispatch_id?: string | null }).bundled_dispatch_id ?? "") ?? null,
            brokers: (s.brokers as unknown as { name: string } | null) ?? null,
          }))}
          isOwner={isOwner}
        />
      </div>
    </div>
  );
}
