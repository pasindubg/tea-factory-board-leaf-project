import { requireModuleAccess } from "@/lib/profile";
import { SubmitButton } from "@/components/submit-button";
import {
  reconcileAcknowledgement,
  type ParsedAcknowledgement,
  type ReconStatus,
} from "@tea/api";
import { confirmAcknowledgement, rejectAcknowledgement } from "../../../actions";

const STATUS_STYLE: Record<ReconStatus, string> = {
  catalogued: "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-400",
  shutout: "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-400",
  missing: "bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-400",
  unexpected: "bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-400",
};

export default async function AckReviewPage({
  params,
}: {
  params: Promise<{ saleId: string; importId: string }>;
}) {
  const { supabase } = await requireModuleAccess("auction");
  const { saleId, importId } = await params;
  const detail = `/dashboard/auction/${saleId}`;

  const { data: imp } = await supabase
    .from("doc_imports")
    .select("id, parsed_json, status, source_filename, sale_id")
    .eq("id", importId)
    .single();

  if (!imp || imp.sale_id !== saleId || !imp.parsed_json) {
    return (
      <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-8 text-center text-stone-500 dark:text-stone-400">
        Staged import not found.{" "}
        <a href={detail} className="text-green-700 dark:text-green-400 hover:underline">
          Back to sale
        </a>
      </div>
    );
  }

  const { data: sale } = await supabase.from("auction_sales").select("sale_no").eq("id", saleId).single();
  const { data: lotRows } = await supabase
    .from("auction_lots")
    .select("id, invoice_no, grade, net_wt")
    .eq("sale_id", saleId);

  const parsed = imp.parsed_json as ParsedAcknowledgement;
  const invoiced = (lotRows ?? []).map((l) => ({
    id: l.id as string,
    invoiceNo: l.invoice_no as string,
    grade: l.grade as string,
    netWt: Number(l.net_wt),
  }));
  const recon = reconcileAcknowledgement(invoiced, parsed);
  const order: Record<ReconStatus, number> = { missing: 0, unexpected: 1, shutout: 2, catalogued: 3 };
  const rows = [...recon.rows].sort(
    (a, b) => order[a.status] - order[b.status] || a.invoiceNo.localeCompare(b.invoiceNo),
  );
  const confirmed = imp.status === "confirmed";
  const s = recon.summary;
  const chips: [string, number, string][] = [
    ["Catalogued", s.catalogued, "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-400"],
    ["Shutout", s.shutout, "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-400"],
    ["Missing", s.missing, "bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-400"],
    ["Unexpected", s.unexpected, "bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-400"],
    ["Weight mismatches", s.weightMismatches, "bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300"],
  ];

  return (
    <div className="space-y-6">
      <div>
        <a href={detail} className="text-sm text-green-700 dark:text-green-400 hover:underline">
          ← Sale {sale?.sale_no ?? ""}
        </a>
        <h2 className="mt-1 text-xl font-semibold">Reconciliation ① — invoice ↔ acknowledgement</h2>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {imp.source_filename ?? "acknowledgement.pdf"} · sale {parsed.saleNo ?? "—"} · sale date{" "}
          {parsed.saleDate ?? "—"}
        </p>
      </div>

      {confirmed && (
        <p className="rounded-md bg-green-50 dark:bg-green-950 px-3 py-2 text-sm text-green-800 dark:text-green-400">
          This acknowledgement has been confirmed — lot states below are applied.
        </p>
      )}

      {parsed.issues.length > 0 && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950 px-3 py-2 text-sm text-amber-800 dark:text-amber-400">
          <p className="font-medium">Parse warnings — review before confirming:</p>
          <ul className="ml-4 list-disc">
            {parsed.issues.map((i, idx) => (
              <li key={idx}>{i}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {chips.map(([label, n, cls]) => (
          <span key={label} className={`rounded-full px-3 py-1 text-sm ${cls}`}>
            {label}: <strong>{n}</strong>
          </span>
        ))}
        {s.shutout > 0 && (
          <span className="rounded-full bg-red-50 dark:bg-red-950 px-3 py-1 text-sm text-red-700 dark:text-red-400">
            {s.shutoutKg.toFixed(2)} kg left at warehouse
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
              <th className="px-3 py-3">Invoice</th>
              <th className="px-3 py-3">Result</th>
              <th className="px-3 py-3">Invoiced</th>
              <th className="px-3 py-3">Lot no.</th>
              <th className="px-3 py-3">Catalogued (ack)</th>
              <th className="px-3 py-3 text-right">Δ net kg</th>
              <th className="px-3 py-3">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.invoiceNo} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
                <td className="px-3 py-2 font-medium">{r.invoiceNo}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                </td>
                <td className="px-3 py-2">
                  {r.invoiced ? `${r.invoiced.grade} · ${r.invoiced.netWt.toFixed(2)} kg` : "—"}
                </td>
                <td className="px-3 py-2">{r.ack?.lotNo ?? "—"}</td>
                <td className="px-3 py-2">
                  {r.ack ? `${r.ack.grade} · ${r.ack.netWt.toFixed(2)} kg` : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.weightDelta == null
                    ? "—"
                    : `${r.weightDelta > 0 ? "+" : ""}${r.weightDelta.toFixed(2)}`}
                </td>
                <td className="px-3 py-2 text-xs text-stone-500 dark:text-stone-400">
                  {r.status === "missing" && "Invoiced but absent from the acknowledgement"}
                  {r.status === "unexpected" && "In the acknowledgement but never invoiced"}
                  {r.gradeMismatch && <span className="text-amber-700 dark:text-amber-400"> grade differs</span>}
                  {r.weightDelta != null && Math.abs(r.weightDelta) > 0.01 && (
                    <span className="text-amber-700 dark:text-amber-400"> weight differs</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!confirmed && (
        <div className="flex gap-3">
          <form action={confirmAcknowledgement.bind(null, importId, saleId)}>
            <SubmitButton
              pendingText="Cataloguing…"
              className="rounded-md bg-green-700 dark:bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:hover:bg-green-700"
            >
              Confirm — catalogue {s.catalogued} lot(s)
            </SubmitButton>
          </form>
          <form action={rejectAcknowledgement.bind(null, importId, saleId)}>
            <SubmitButton
              pendingText="…"
              className="rounded-md border border-stone-300 dark:border-stone-600 px-4 py-2 text-sm text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              Reject
            </SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
