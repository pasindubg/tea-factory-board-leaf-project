import { requireModuleAccess } from "@/lib/profile";
import { SubmitButton } from "@/components/submit-button";
import type { ParsedValuation } from "@tea/api";
import { confirmValuation, rejectImport } from "../../../actions";

export default async function ValuationReviewPage({
  params,
}: {
  params: Promise<{ saleId: string; importId: string }>;
}) {
  const { supabase } = await requireModuleAccess("auction");
  const { saleId, importId } = await params;
  const detail = `/dashboard/auction/${saleId}`;

  const { data: imp } = await supabase
    .from("doc_imports")
    .select("parsed_json, status, source_filename, sale_id")
    .eq("id", importId)
    .single();
  if (!imp || imp.sale_id !== saleId || !imp.parsed_json) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-8 text-center text-stone-500">
        Staged import not found.{" "}
        <a href={detail} className="text-green-700 hover:underline">
          Back to sale
        </a>
      </div>
    );
  }

  const { data: sale } = await supabase.from("auction_sales").select("sale_no").eq("id", saleId).single();
  const { data: lotRows } = await supabase.from("auction_lots").select("invoice_no").eq("sale_id", saleId);
  const known = new Set((lotRows ?? []).map((l) => l.invoice_no as string));

  const parsed = imp.parsed_json as ParsedValuation;
  const confirmed = imp.status === "confirmed";
  const matched = parsed.lots.filter((l) => known.has(l.invoiceNo)).length;

  return (
    <div className="space-y-6">
      <div>
        <a href={detail} className="text-sm text-green-700 hover:underline">
          ← Sale {sale?.sale_no ?? ""}
        </a>
        <h2 className="mt-1 text-xl font-semibold">Valuation review</h2>
        <p className="text-sm text-stone-500">
          {imp.source_filename ?? "valuation.pdf"} · {parsed.lots.length} lots · {matched} match a catalogued lot
        </p>
      </div>

      {confirmed && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          Valuations confirmed and applied.
        </p>
      )}
      {parsed.issues.length > 0 && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <p className="font-medium">Parse warnings:</p>
          <ul className="ml-4 list-disc">
            {parsed.issues.map((i, idx) => (
              <li key={idx}>{i}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
              <th className="px-3 py-3">Invoice</th>
              <th className="px-3 py-3">Lot</th>
              <th className="px-3 py-3">Grade</th>
              <th className="px-3 py-3 text-right">Net kg</th>
              <th className="px-3 py-3 text-right">Valuation /kg</th>
              <th className="px-3 py-3 text-right">Projected</th>
              <th className="px-3 py-3">Tasting note</th>
              <th className="px-3 py-3">Match</th>
            </tr>
          </thead>
          <tbody>
            {parsed.lots.map((l) => (
              <tr key={l.invoiceNo} className="border-b border-stone-100 last:border-0 align-top">
                <td className="px-3 py-2 font-medium">{l.invoiceNo}</td>
                <td className="px-3 py-2">{l.lotNo}</td>
                <td className="px-3 py-2">{l.grade}</td>
                <td className="px-3 py-2 text-right">{l.netWt.toFixed(2)}</td>
                <td className="px-3 py-2 text-right">
                  {l.priceMin === l.priceMax ? l.priceMin.toFixed(2) : `${l.priceMin}–${l.priceMax}`}
                </td>
                <td className="px-3 py-2 text-right">{l.projectedProceeds.toLocaleString()}</td>
                <td className="px-3 py-2 max-w-xs text-xs text-stone-500">{l.tastingNote}</td>
                <td className="px-3 py-2">
                  {known.has(l.invoiceNo) ? (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">lot</span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">no lot</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!confirmed && (
        <div className="flex gap-3">
          <form action={confirmValuation.bind(null, importId, saleId)}>
            <SubmitButton
              pendingText="Saving…"
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
            >
              Confirm — record {matched} valuation(s)
            </SubmitButton>
          </form>
          <form action={rejectImport.bind(null, importId, saleId)}>
            <SubmitButton
              pendingText="…"
              className="rounded-md border border-stone-300 px-4 py-2 text-sm text-stone-600 hover:bg-stone-100"
            >
              Reject
            </SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
