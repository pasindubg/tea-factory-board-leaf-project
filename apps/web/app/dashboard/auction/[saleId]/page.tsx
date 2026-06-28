import Link from "next/link";
import { requireModuleAccess } from "@/lib/profile";
import { SubmitButton } from "@/components/submit-button";
import {
  addDispatchedLot,
  ingestAcknowledgement,
  ingestValuation,
  ingestContract,
  ingestBankCsv,
} from "../actions";
import { DispatchLotForm } from "./dispatch-lot-form";
import { DispatchedLotsTable } from "./dispatched-lots-table";
import { DeleteDispatchButton } from "./delete-dispatch-button";
import { stateBucket } from "../state-buckets";

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
    .select("id, sale_no, dispatch_date, sale_date, prompt_date, status, brokers(name)")
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
  const [{ data: marks }, { data: lots }, { data: imports }] = await Promise.all([
    supabase.from("marks").select("id, code, name").order("code"),
    supabase
      .from("auction_lots")
      .select(
        "id, invoice_no, lot_no, grade, bags, kg_per_bag, net_wt, state, shutout_reason, marks(code), lot_invoices(invoice_no)",
      )
      .eq("sale_id", saleId)
      .order("invoice_no"),
    supabase
      .from("doc_imports")
      .select("id, source_filename, status, parsed_at, doc_type")
      .eq("sale_id", saleId)
      .order("parsed_at", { ascending: false }),
  ]);

  const rows = lots ?? [];
  const totalNet = rows.reduce((sum, l) => sum + Number(l.net_wt ?? 0), 0);
  const allImports = imports ?? [];
  const ackImports = allImports.filter((i) => i.doc_type === "acknowledgement");
  const valImports = allImports.filter((i) => i.doc_type === "valuation");
  const conImports = allImports.filter((i) => i.doc_type === "contract");
  const bankImports = allImports.filter((i) => i.doc_type === "bank_csv");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/dashboard/auction" className="text-sm text-green-700 dark:text-green-400 hover:underline">
            ← Dispatches Overview
          </Link>
          <h2 className="mt-1 text-xl font-semibold">Dispatch {sale.sale_no}</h2>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {broker}
            {sale.dispatch_date ? ` · dispatched ${sale.dispatch_date}` : ""}
            {sale.sale_date ? ` · sale ${sale.sale_date}` : ""}
            {sale.prompt_date ? ` · prompt ${sale.prompt_date}` : ""}
            {" · "}
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${stateBucket(sale.status).style}`}
              title={`Actual status: ${sale.status}`}
            >
              {stateBucket(sale.status).label}
            </span>
          </p>
        </div>
        {(sale.status === "dispatched" || sale.status === "draft") && isOwner && (
          <DeleteDispatchButton saleId={sale.id} />
        )}
      </div>

      {error && <p className="rounded-md bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {notice && <p className="rounded-md bg-green-50 dark:bg-green-950 px-3 py-2 text-sm text-green-800 dark:text-green-400">{notice}</p>}

      {/* Document ingestion → reconciliations ①/② — 2 per row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <IngestSection
          title="Acknowledgement"
          description="Catalogue lots and reconcile (①) against what you invoiced; shutouts are flagged."
          action={ingestAcknowledgement.bind(null, sale.id)}
          reviewBase={`/dashboard/auction/${sale.id}/ack`}
          imports={ackImports}
        />
        <IngestSection
          title="Valuation report"
          description="Record the broker's per-lot valuation — price range, projected proceeds and tasting notes."
          action={ingestValuation.bind(null, sale.id)}
          reviewBase={`/dashboard/auction/${sale.id}/valuation`}
          imports={valImports}
        />
        <IngestSection
          title="Sellers contract"
          description="Record the actual sale (buyer, price, VAT, guarantee) and reconcile (②) against the valuation."
          action={ingestContract.bind(null, sale.id)}
          reviewBase={`/dashboard/auction/${sale.id}/contract`}
          imports={conImports}
        />
        <IngestSection
          title="Bank statement (CSV)"
          description="Upload the bank statement to reconcile (④) settlements against the credits that actually arrived."
          action={ingestBankCsv.bind(null, sale.id)}
          reviewBase={`/dashboard/auction/${sale.id}/bank`}
          imports={bankImports}
          accept=".csv,text/csv"
        />
      </div>

      {/* Dispatched lots — the factory's record of what it sent to the broker's store. */}
      <section>
        <div className="flex items-baseline justify-between">
          <div>
            <h3 className="text-lg font-medium text-stone-700 dark:text-stone-300">Dispatched lots</h3>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {rows.length} lot{rows.length === 1 ? "" : "s"} · {totalNet.toFixed(2)} kg net
            </p>
          </div>
          <DispatchLotForm action={addDispatchedLot.bind(null, sale.id)} marks={marks ?? []} />
        </div>

        <div className="mt-4">
          <DispatchedLotsTable rows={rows.map(l => ({
            id: l.id as string,
            invoice_no: l.invoice_no as string | null,
            lot_no: l.lot_no as string | null,
            grade: l.grade as string | null,
            bags: l.bags as number | null,
            kg_per_bag: l.kg_per_bag as number | null,
            net_wt: l.net_wt as number | string | null,
            state: l.state as string | null,
            shutout_reason: l.shutout_reason as string | null,
            marks: (l.marks as unknown as { code: string } | null) ?? null,
            lot_invoices: (l.lot_invoices as unknown as { invoice_no: string }[] | null) ?? null,
          }))} saleId={sale.id} isOwner={isOwner} />
        </div>
      </section>
    </div>
  );
}

type ImportRow = { id: string; source_filename: string | null; status: string; parsed_at: string | null };

function IngestSection({
  title,
  description,
  action,
  reviewBase,
  imports,
  accept = "application/pdf",
}: {
  title: string;
  description: string;
  action: (formData: FormData) => void;
  reviewBase: string;
  imports: ImportRow[];
  accept?: string;
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-300">{title}</h3>
      <p className="text-xs text-stone-400 dark:text-stone-500 leading-relaxed">{description}</p>
      <form
        action={action}
        className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-800/50 p-3 hover:border-stone-300 dark:hover:border-stone-600 transition-colors"
      >
        <input
          type="file"
          name="file"
          accept={accept}
          required
          className="text-xs file:mr-2 file:rounded file:border-0 file:bg-green-700 file:px-2 file:py-1 file:text-xs file:text-white hover:file:bg-green-800"
        />
        <SubmitButton
          pendingText="…"
          className="rounded-md bg-green-700 dark:bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800 dark:hover:bg-green-700"
        >
          Upload &amp; review
        </SubmitButton>
      </form>

      {imports.length > 0 && (
        <div className="mt-2 overflow-x-auto rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-[10px] uppercase tracking-wide text-stone-400 dark:text-stone-500">
                <th className="px-3 py-2">File</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Uploaded</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {imports.map((im) => (
                <tr key={im.id} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
                  <td className="px-3 py-1.5 truncate max-w-[120px]">{im.source_filename ?? "document.pdf"}</td>
                  <td className="px-3 py-1.5">
                    <span className="rounded-full bg-stone-100 dark:bg-stone-800 px-2 py-0.5 text-[10px] text-stone-600 dark:text-stone-400">{im.status}</span>
                  </td>
                  <td className="px-3 py-1.5 text-stone-400 dark:text-stone-500">
                    {im.parsed_at ? new Date(im.parsed_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <Link href={`${reviewBase}/${im.id}`} className="text-green-700 dark:text-green-400 hover:underline">
                      Review
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
