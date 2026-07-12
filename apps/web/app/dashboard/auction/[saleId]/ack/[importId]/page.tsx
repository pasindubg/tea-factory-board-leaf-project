import Link from "next/link";
import { requireModuleAccess } from "@/lib/profile";
import { SubmitButton } from "@/components/submit-button";
import {
  reconcileAcknowledgement,
  type ParsedAcknowledgement,
  type ReconStatus,
} from "@tea/api";
import { confirmAcknowledgement, rejectAcknowledgement } from "../../../actions";
import { buildInvoicedLots } from "../../../recon-helpers";
import { canonicalGrade, gradeAliasMap, saleGroupIds } from "../../../_actions/_shared";
import { saleNoKey } from "../../../sale-number";
import { ComparePanel, type Orphan, type Candidate, type AuditRow } from "./compare-panel";
import { ReconTable } from "./recon-table";

export default async function AckReviewPage({
  params,
}: {
  params: Promise<{ saleId: string; importId: string }>;
}) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const { saleId, importId } = await params;
  const fallback = "/dashboard/auction/sales";

  const { data: imp } = await supabase
    .from("doc_imports")
    .select("id, parsed_json, status, source_filename, sale_id, doc_type")
    .eq("id", importId)
    .single();

  if (!imp || imp.sale_id !== saleId || imp.doc_type !== "acknowledgement" || !imp.parsed_json) {
    return (
      <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-8 text-center text-stone-500 dark:text-stone-400">
        Staged import not found.{" "}
        <Link href={fallback} className="text-green-700 dark:text-green-400 hover:underline">
          Back to sales
        </Link>
      </div>
    );
  }

  const { data: sale } = await supabase.from("auction_sales").select("sale_no, target_sale_no, brokers(name)").eq("id", saleId).single();
  const detail = `/dashboard/auction/sales/${encodeURIComponent(saleNoKey((sale?.target_sale_no as string | null) || (sale?.sale_no as string | null)) || saleId)}`;
  // The ack is the broker's statement for the WHOLE sale — reconcile against
  // every dispatch in this sale's group, not just the one being reviewed.
  const groupIds = await saleGroupIds(supabase, profile.factory_id, saleId);
  const { data: lotRows } = await supabase
    .from("auction_lots")
    .select("id, sale_id, invoice_no, grade, net_wt, state, lot_no, marks(code), lot_invoices(invoice_no)")
    .in("sale_id", groupIds);
  const { data: auditRows } = await supabase
    .from("auction_audit")
    .select("action, detail, reason, actor, confidence_shown, created_at")
    .in("sale_id", groupIds)
    .order("created_at", { ascending: false })
    .limit(50);

  const aliases = await gradeAliasMap(supabase, profile.factory_id);
  const rawParsed = imp.parsed_json as ParsedAcknowledgement;
  const parsed: ParsedAcknowledgement = {
    ...rawParsed,
    lots: rawParsed.lots.map((lot) => ({ ...lot, grade: canonicalGrade(lot.grade, aliases) })),
  };
  const invoiced = buildInvoicedLots(lotRows ?? []);
  const recon = reconcileAcknowledgement(invoiced, parsed);
  const order: Record<ReconStatus, number> = { pending: 0, unexpected: 1, shutout: 2, catalogued: 3 };

  // ── Orphan-resolver inputs (#19) ──
  // Orphans = pending/invoiced lots still factory-side (drop ones already resolved
  // by a manual link/mark). Candidates = "unexpected" ack lots not yet consumed
  // (their lot_no isn't already on an acknowledged lot in the DB).
  const lotById = new Map((lotRows ?? []).map((l) => [l.id as string, l]));
  const cataloguedLotNos = new Set(
    (lotRows ?? [])
      .filter((l) => ["acknowledged", "catalogued"].includes(l.state as string) && l.lot_no)
      .map((l) => l.lot_no as string),
  );
  const markOf = (id: string) => (lotById.get(id)?.marks as unknown as { code: string } | null)?.code ?? null;
  const orphans: Orphan[] = recon.rows
    .filter((r) => r.status === "pending" && r.invoiced)
    // Any not-yet-acknowledged invoiced lot is resolvable. Newly added
    // invoiced lots after ack confirmation count too; excluding them silently
    // hid the resolver for genuine orphans.
    .filter((r) => ["invoiced", "dispatched", "pending"].includes(lotById.get(r.invoiced!.id)?.state as string))
    .map((r) => ({
      lotId: r.invoiced!.id,
      // The orphan's own dispatch — may be a sibling in the sale group, so
      // resolver actions must guard against it, not the page's saleId.
      dispatchId: (lotById.get(r.invoiced!.id)?.sale_id as string) ?? saleId,
      invoiceNo: r.invoiceNo,
      grade: r.invoiced!.grade,
      netWt: r.invoiced!.netWt,
      markCode: markOf(r.invoiced!.id),
    }));
  const candidates: Candidate[] = recon.rows
    .filter((r) => r.status === "unexpected" && r.ack && !cataloguedLotNos.has(r.ack.lotNo ?? ""))
    .map((r) => ({
      key: r.ack!.lotNo ?? r.invoiceNo,
      lotNo: r.ack!.lotNo,
      grade: r.ack!.grade,
      netWt: r.ack!.netWt,
      markCode: r.ack!.markCode,
    }));
  const audit: AuditRow[] = (auditRows ?? []).map((a) => ({
    action: a.action as string,
    detail: a.detail as string,
    reason: (a.reason as string) ?? null,
    actor: a.actor as string,
    confidenceShown: a.confidence_shown != null ? Number(a.confidence_shown) : null,
    createdAt: a.created_at as string,
  }));
  const rows = [...recon.rows].sort(
    (a, b) => order[a.status] - order[b.status] || a.invoiceNo.localeCompare(b.invoiceNo),
  );
  const confirmed = imp.status === "confirmed";
  const s = recon.summary;
  const chips: [string, number, string][] = [
    ["Acknowledged", s.catalogued, "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-400"],
    ["Shutout", s.shutout, "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-400"],
    ["Pending", s.pending, "bg-sky-100 dark:bg-sky-900 text-sky-800 dark:text-sky-300"],
    ["Unexpected", s.unexpected, "bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-400"],
    ["Weight mismatches", s.weightMismatches, "bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300"],
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href={detail} className="text-sm text-green-700 dark:text-green-400 hover:underline">
          ← Sale {(sale?.target_sale_no as string | null) ?? (sale?.sale_no as string | null) ?? ""}
        </Link>
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
        {s.pending > 0 && (
          <span className="rounded-full bg-sky-50 dark:bg-sky-950 px-3 py-1 text-sm text-sky-700 dark:text-sky-300">
            {s.pendingKg.toFixed(2)} kg invoiced, not yet acknowledged
          </span>
        )}
      </div>

      {/* Compare & resolve — link a pending invoice to an unexpected catalogue lot. */}
      <ComparePanel saleId={saleId} orphans={orphans} candidates={candidates} audit={audit} />

      <ReconTable rows={rows} />

      {!confirmed && (
        <div className="flex gap-3">
          <form action={confirmAcknowledgement.bind(null, importId, saleId)}>
            <SubmitButton
              pendingText="Acknowledging..."
              className="rounded-md bg-green-700 dark:bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:hover:bg-green-700"
            >
              Confirm — acknowledge {s.catalogued} lot(s)
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
