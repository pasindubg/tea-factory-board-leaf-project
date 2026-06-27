import { requireModuleAccess } from "@/lib/profile";
import { SubmitButton } from "@/components/submit-button";
import {
  addInvoicedLot,
  deleteLot,
  deleteSale,
  ingestAcknowledgement,
  ingestValuation,
  ingestContract,
} from "../actions";

const GRADES = ["OP", "OP1", "OPA", "PEK", "PEK1", "BOP", "BOPF", "FBOP", "DUST", "BM"];

const LOT_STATE_STYLE: Record<string, string> = {
  invoiced: "bg-stone-100 text-stone-600",
  catalogued: "bg-blue-100 text-blue-800",
  shutout: "bg-red-100 text-red-800",
  valued: "bg-amber-100 text-amber-800",
  sold: "bg-green-100 text-green-800",
  withdrawn: "bg-stone-100 text-stone-500",
  settled: "bg-green-100 text-green-800",
};

const input = "mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm";
const label = "block text-sm font-medium text-stone-600";

export default async function SaleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ saleId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { supabase } = await requireModuleAccess("auction");
  const { saleId } = await params;
  const { error, notice } = await searchParams;

  const { data: sale } = await supabase
    .from("auction_sales")
    .select("id, sale_no, sale_date, prompt_date, status, brokers(name)")
    .eq("id", saleId)
    .single();

  if (!sale) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-8 text-center text-stone-500">
        Sale not found.{" "}
        <a href="/dashboard/auction" className="text-green-700 hover:underline">
          Back to sales
        </a>
      </div>
    );
  }

  const broker = (sale.brokers as unknown as { name: string } | null)?.name ?? "—";
  const [{ data: marks }, { data: lots }, { data: imports }] = await Promise.all([
    supabase.from("marks").select("id, code, name").order("code"),
    supabase
      .from("auction_lots")
      .select("id, invoice_no, lot_no, grade, bags, kg_per_bag, net_wt, state, shutout_reason, marks(code)")
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

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <a href="/dashboard/auction" className="text-sm text-green-700 hover:underline">
            ← Sales
          </a>
          <h2 className="mt-1 text-xl font-semibold">Sale {sale.sale_no}</h2>
          <p className="text-sm text-stone-500">
            {broker}
            {sale.sale_date ? ` · sale ${sale.sale_date}` : ""}
            {sale.prompt_date ? ` · prompt ${sale.prompt_date}` : ""}
            {" · "}
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${LOT_STATE_STYLE[sale.status] ?? "bg-stone-100 text-stone-600"}`}
            >
              {sale.status}
            </span>
          </p>
        </div>
        {sale.status === "draft" && (
          <form action={deleteSale.bind(null, sale.id)}>
            <SubmitButton
              pendingText="Deleting…"
              className="rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-500 hover:bg-stone-100"
            >
              Delete sale
            </SubmitButton>
          </form>
        )}
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>}

      {/* Invoiced lots — the factory's record of what it dispatched to the broker. */}
      <section>
        <div className="flex items-baseline justify-between">
          <h3 className="text-lg font-medium text-stone-700">Invoiced lots</h3>
          <p className="text-sm text-stone-500">
            {rows.length} lot{rows.length === 1 ? "" : "s"} · {totalNet.toFixed(2)} kg net
          </p>
        </div>

        <div className="mt-3 overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
                <th className="px-3 py-3">Invoice</th>
                <th className="px-3 py-3">Mark</th>
                <th className="px-3 py-3">Grade</th>
                <th className="px-3 py-3 text-right">Bags</th>
                <th className="px-3 py-3 text-right">kg/bag</th>
                <th className="px-3 py-3 text-right">Net kg</th>
                <th className="px-3 py-3">Lot no.</th>
                <th className="px-3 py-3">State</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => {
                const markCode = (l.marks as unknown as { code: string } | null)?.code ?? "—";
                return (
                  <tr key={l.id} className="border-b border-stone-100 last:border-0">
                    <td className="px-3 py-2 font-medium">{l.invoice_no}</td>
                    <td className="px-3 py-2">{markCode}</td>
                    <td className="px-3 py-2">{l.grade}</td>
                    <td className="px-3 py-2 text-right">{l.bags ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{l.kg_per_bag != null ? Number(l.kg_per_bag).toFixed(2) : "—"}</td>
                    <td className="px-3 py-2 text-right">{Number(l.net_wt).toFixed(2)}</td>
                    <td className="px-3 py-2">{l.lot_no ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${LOT_STATE_STYLE[l.state] ?? "bg-stone-100 text-stone-600"}`}
                        title={l.shutout_reason ?? undefined}
                      >
                        {l.state}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {l.state === "invoiced" && (
                        <form action={deleteLot.bind(null, l.id, sale.id)}>
                          <SubmitButton pendingText="…" className="text-stone-400 hover:text-red-600 hover:underline">
                            Remove
                          </SubmitButton>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-stone-400">
                    No lots yet. Add the lots you invoiced to the broker for this sale.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Add invoiced lot */}
        <form
          action={addInvoicedLot.bind(null, sale.id)}
          className="mt-4 grid items-end gap-3 rounded-xl border border-stone-200 bg-white p-4 sm:grid-cols-6"
        >
          <div className="sm:col-span-1">
            <label className={label}>Invoice no.</label>
            <input name="invoice_no" required placeholder="0058" className={input} />
          </div>
          <div className="sm:col-span-1">
            <label className={label}>Mark</label>
            <select name="mark_id" className={input} defaultValue="">
              <option value="">—</option>
              {(marks ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-1">
            <label className={label}>Grade</label>
            <input name="grade" required list="auction-grades" placeholder="OP" className={input} />
            <datalist id="auction-grades">
              {GRADES.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>
          <div className="sm:col-span-1">
            <label className={label}>Bags</label>
            <input name="bags" type="number" min="1" step="1" required placeholder="10" className={input} />
          </div>
          <div className="sm:col-span-1">
            <label className={label}>kg / bag</label>
            <input name="kg_per_bag" type="number" min="0" step="0.01" required placeholder="28" className={input} />
          </div>
          <div className="sm:col-span-1">
            <SubmitButton
              pendingText="Adding…"
              className="w-full rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
            >
              Add lot
            </SubmitButton>
          </div>
        </form>
      </section>

      {/* Document ingestion → reconciliations ①/② */}
      <IngestSection
        title="Acknowledgement"
        description="Catalogue these lots and reconcile (①) against what you invoiced; shutouts are flagged."
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
}: {
  title: string;
  description: string;
  action: (formData: FormData) => void;
  reviewBase: string;
  imports: ImportRow[];
}) {
  return (
    <section>
      <h3 className="text-lg font-medium text-stone-700">{title}</h3>
      <p className="text-sm text-stone-500">{description}</p>
      <form
        action={action}
        className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 bg-white p-4"
      >
        <input
          type="file"
          name="file"
          accept="application/pdf"
          required
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-green-700 file:px-3 file:py-1.5 file:text-white hover:file:bg-green-800"
        />
        <SubmitButton
          pendingText="Reading…"
          className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
        >
          Upload &amp; review
        </SubmitButton>
      </form>

      {imports.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Uploaded</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {imports.map((im) => (
                <tr key={im.id} className="border-b border-stone-100 last:border-0">
                  <td className="px-4 py-2">{im.source_filename ?? "document.pdf"}</td>
                  <td className="px-4 py-2">
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">{im.status}</span>
                  </td>
                  <td className="px-4 py-2 text-stone-500">
                    {im.parsed_at ? new Date(im.parsed_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <a href={`${reviewBase}/${im.id}`} className="text-green-700 hover:underline">
                      Review
                    </a>
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
