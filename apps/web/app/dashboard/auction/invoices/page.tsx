import { requirePageAccess } from "@/lib/profile";
import { loadListResource } from "@/lib/list-resource-registry";
import { formatSaleNo } from "../sale-number";
import { InvoiceOverviewTable } from "./invoice-overview-table";

export default async function InvoiceOverviewPage() {
  const { supabase, profile } = await requirePageAccess("auction-invoice-overview");
  // Broker and mark are picked through server-querying LOV comboboxes, so this
  // page no longer preloads their full option lists — only grades, whose
  // sample weight the draft row auto-fills locally.
  const [invoicesResult, { data: grades, error: gradeError }, { data: latest }] =
    await Promise.all([
      loadListResource({ key: "auction.invoice-overview" }),
      supabase
        .from("auction_grades")
        .select("code, name, sample_weight, default_kg_per_bag")
        .eq("active", true)
        .order("sort_order")
        .order("code"),
      // Seeds the draft row's dates and sale no. from the invoice most recently
      // worked on, so a run of entries for the same dispatch needs no retyping.
      // Every one of them stays editable in the row.
      supabase
        .from("auction_sales")
        .select("dispatch_date, sale_date, target_sale_no")
        .eq("sale_kind", "dispatch")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
  if (!invoicesResult.ok) throw new Error(invoicesResult.error);
  if (gradeError) throw new Error(`Could not load invoice reference data: ${gradeError.message}`);

  const isOwner = profile.role === "owner";
  const latestInvoice = latest as { dispatch_date: string | null; sale_date: string | null; target_sale_no: string | null } | null;
  const defaults = {
    dispatchDate: latestInvoice?.dispatch_date ?? null,
    saleDate: latestInvoice?.sale_date ?? null,
    saleNo: formatSaleNo(latestInvoice?.target_sale_no ?? null) || null,
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Invoice Overview</h2>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Every lot invoice in the factory with its broker invoice&apos;s broker, selling mark, dates and state.
          New invoices join the open broker invoice for their broker, selling mark and dispatch date.
        </p>
      </div>
      <InvoiceOverviewTable
        rows={invoicesResult.rows}
        isOwner={isOwner}
        canEdit
        canCreate
        defaults={defaults}
        grades={(grades ?? []).map((grade) => {
          const row = grade as { sample_weight?: string | number | null; default_kg_per_bag?: string | number | null };
          return {
            code: grade.code as string,
            name: grade.name as string,
            sampleWeight: row.sample_weight == null ? null : Number(row.sample_weight),
            defaultKgPerBag: row.default_kg_per_bag == null ? null : Number(row.default_kg_per_bag),
          };
        })}
      />
    </div>
  );
}
