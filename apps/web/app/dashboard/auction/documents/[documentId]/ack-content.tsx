import { SubmitButton } from "@/components/submit-button";
import { ConfirmSubmitButton } from "@/components/confirmation-dialog";
import {
  invoiceMatchKey,
  reconcileAcknowledgement,
  relateAcknowledgementParseWarnings,
  type ParsedAcknowledgement,
  type ReconStatus,
} from "@tea/api";
import { confirmAcknowledgement, rejectImport } from "@/app/dashboard/auction/actions";
import { buildInvoicedLots } from "@/app/dashboard/auction/recon-helpers";
import { canonicalGrade, gradeAliasMap, saleGroupIds } from "@/app/dashboard/auction/_actions/_shared";
import { formatFourDigitNo } from "@/app/dashboard/auction/sale-number";
import { resolveAckCarryForward } from "@/app/dashboard/auction/_actions/carry-forward";
import { applyServerListSearch } from "@/lib/list-search-state";
import type { requirePageAccess } from "@/lib/profile";
import { ComparePanel, type Orphan, type Candidate, type AuditRow } from "./compare-panel";
import { ReconTable, type ReviewReconRow } from "./recon-table";

type Ctx = Awaited<ReturnType<typeof requirePageAccess>>;

export async function AckContent({
  supabase,
  profile,
  saleId,
  importId,
}: {
  supabase: Ctx["supabase"];
  profile: Ctx["profile"];
  saleId: string;
  importId: string;
}) {
  const { data: imp } = await supabase
    .from("doc_imports")
    .select("id, parsed_json, status, source_filename")
    .eq("id", importId)
    .single();

  if (!imp?.parsed_json) {
    return <p className="text-sm text-stone-500 dark:text-stone-400">Staged import not found.</p>;
  }

  // The ack is the broker's statement for the WHOLE sale — reconcile against
  // every dispatch in this sale's group, not just the one being reviewed.
  const groupIds = await saleGroupIds(supabase, profile.factory_id, saleId);
  const { data: lotRows } = await supabase
    .from("auction_lots")
    .select("id, sale_id, invoice_no, grade, net_wt, state, lot_no, lot_source, reprint, reprint_registered, marks(code), lot_invoices(invoice_no)")
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

  // reconcileAcknowledgement only knows the lots invoiced in THIS sale group,
  // so a lot carried forward from an earlier broker invoice — including a
  // re-print registered at cutover — necessarily lands in `unexpected` there.
  // Resolving it here is what makes the count on screen mean what the operator
  // thinks it means: `unexpected` = the broker catalogued something we have no
  // record of anywhere, which is worth investigating. This is the same call
  // confirmAcknowledgement makes, so the preview cannot promise one outcome
  // and confirmation perform another.
  const { data: groupSaleRows } = await supabase
    .from("auction_sales")
    .select("broker_id")
    .in("id", groupIds)
    .limit(1);
  const unexpectedRows = recon.rows.filter((row) => row.status === "unexpected" && row.ack);
  const carryForward = await resolveAckCarryForward(supabase, profile.factory_id, {
    groupIds,
    brokerId: (groupSaleRows ?? [])[0]?.broker_id as string | null ?? null,
    rows: unexpectedRows.map((row) => ({ invoiceNo: row.invoiceNo, lotNo: row.ack?.lotNo ?? null })),
  });

  // The lot a confirmed acknowledgement created for a row it could not place.
  // Registering a re-print acts on that lot, so it only exists after confirm.
  const ackLotByInvoice = new Map(
    (lotRows ?? [])
      .filter((lot) => lot.lot_source === "acknowledgement")
      .map((lot) => [invoiceMatchKey(lot.invoice_no as string | null), lot]),
  );

  const reviewRows: ReviewReconRow[] = recon.rows.map((row) => {
    const ackLot = ackLotByInvoice.get(invoiceMatchKey(row.invoiceNo));
    const registration = {
      lotId: (ackLot?.id as string | undefined) ?? null,
      reprintRegistered: Boolean(ackLot?.reprint_registered),
      // Registering does not need the lot to exist: it records the EARLIER
      // sale's lot, which the carry-forward resolver then links on confirm.
      canRegister: row.status === "unexpected" && !ackLot?.reprint,
    };
    const outcome = row.status === "unexpected" ? carryForward.get(row.invoiceNo) : undefined;
    if (outcome?.status === "matched") {
      const fromInvoice = formatFourDigitNo(outcome.lot.auction_sales?.sale_no ?? null) || "—";
      return {
        ...row,
        ...registration,
        canRegister: false,
        display: outcome.isReprint ? "re-print" : "rolled forward",
        carryForwardNote: outcome.isReprint
          ? `Registered re-print on broker invoice ${fromInvoice} — links as a re-print child`
          : `Rolls forward from broker invoice ${fromInvoice}`,
      };
    }
    if (outcome?.status === "blocked") {
      const fromInvoice = formatFourDigitNo(outcome.lot.auction_sales?.sale_no ?? null) || "—";
      return { ...row, ...registration, canRegister: false, display: "unexpected", carryForwardNote: `Matches a sold/settled lot on broker invoice ${fromInvoice} — resolve by hand` };
    }
    return { ...row, ...registration, display: row.status, carryForwardNote: null };
  });

  const order: Record<ReviewReconRow["display"], number> = {
    pending: 0, unexpected: 1, "re-print": 2, "rolled forward": 3, shutout: 4, catalogued: 5,
  };

  // ── Orphan-resolver inputs (#19) ──
  // Orphans = pending/invoiced lots still factory-side (drop ones already resolved
  // by a manual link/mark). Candidates = "unexpected" ack lots not yet consumed
  // (their lot_no isn't already on an acknowledged lot in the DB).
  const lotById = new Map((lotRows ?? []).map((l) => [l.id as string, l]));
  const cataloguedLotNos = new Set(
    (lotRows ?? [])
      .filter((l) => ["acknowledged", "valued", "sold"].includes(l.state as string) && l.lot_no)
      .map((l) => l.lot_no as string),
  );
  const markOf = (id: string) => (lotById.get(id)?.marks as unknown as { code: string } | null)?.code ?? null;
  const orphans: Orphan[] = recon.rows
    .filter((r) => r.status === "pending" && r.invoiced)
    // Any not-yet-acknowledged invoiced lot is resolvable. Newly added
    // invoiced lots after ack confirmation count too; excluding them silently
    // hid the resolver for genuine orphans.
    .filter((r) => lotById.get(r.invoiced!.id)?.state === "invoiced")
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
  // Only rows still genuinely unplaced are offered to the manual resolver — a
  // row the register already answers must not be presented as needing a human.
  const candidates: Candidate[] = reviewRows
    .filter((r) => r.display === "unexpected" && r.ack && !cataloguedLotNos.has(r.ack.lotNo ?? ""))
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
  const rows = [...reviewRows].sort(
    (a, b) => order[a.display] - order[b.display] || a.invoiceNo.localeCompare(b.invoiceNo),
  );
  const warningRelations = relateAcknowledgementParseWarnings(parsed.issues, rows);
  const warningInvoiceNos = [...new Set(warningRelations.flatMap((relation) => relation.rows.map((row) => row.invoiceNo)))];
  const confirmed = imp.status === "confirmed";
  const s = recon.summary;
  const shown = (display: ReviewReconRow["display"]) => reviewRows.filter((row) => row.display === display).length;
  const reprints = shown("re-print");
  const rolledForward = shown("rolled forward");
  // Counted off reviewRows, not recon.summary: the summary predates the
  // carry-forward resolution above, so it would still report a registered
  // re-print as unexpected while the table beneath it says otherwise.
  const chips: [string, number, string][] = [
    ["Acknowledged", s.catalogued, "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-400"],
    ["Shutout", s.shutout, "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-400"],
    ["Pending", s.pending, "bg-sky-100 dark:bg-sky-900 text-sky-800 dark:text-sky-300"],
    ...(reprints > 0 ? [["Re-print", reprints, "bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-300"] as [string, number, string]] : []),
    ...(rolledForward > 0 ? [["Rolled forward", rolledForward, "bg-teal-100 dark:bg-teal-900 text-teal-800 dark:text-teal-300"] as [string, number, string]] : []),
    ["Unexpected", shown("unexpected"), "bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-400"],
    ["Weight mismatches", s.weightMismatches, "bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300"],
  ];

  const [visibleRows, visibleOrphans, visibleAudit] = await Promise.all([
    applyServerListSearch(supabase, profile, "acknowledgement-reconciliation", rows),
    applyServerListSearch(supabase, profile, "acknowledgement-orphan-resolver", orphans),
    applyServerListSearch(supabase, profile, "workflow-audit-ack", audit),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-stone-800 dark:text-stone-100">Reconciliation ① — invoice ↔ acknowledgement</h3>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          sale {parsed.saleNo ?? "—"} · sale date {parsed.saleDate ?? "—"}
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
          {warningRelations.map((relation) => (
            <div key={relation.issue} className="mt-3 rounded border border-amber-300/80 bg-amber-100/70 px-3 py-2 dark:border-amber-800 dark:bg-amber-900/30">
              <p className="font-medium">Related reconciliation record{relation.rows.length === 1 ? "" : "s"}</p>
              <p className="mt-1">
                The printed catalogue total is {Math.abs(relation.differenceKg).toFixed(2)} kg {relation.differenceKg > 0 ? "higher" : "lower"} than the parsed rows. {relation.rows.map((row) => `Invoice ${row.invoiceNo} is ${row.status} at ${row.kg.toFixed(2)} kg`).join("; ")} — a close match to review, not an automatic conclusion.
              </p>
            </div>
          ))}
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
      <ComparePanel saleId={saleId} orphans={visibleOrphans} candidates={candidates} audit={visibleAudit} />

      <ReconTable rows={visibleRows} saleId={saleId} warningInvoiceNos={warningInvoiceNos} canRegisterReprint={profile.role === "owner"} />

      {!confirmed && (
        <div className="flex gap-3">
          <form action={confirmAcknowledgement.bind(null, importId, saleId)}>
            <SubmitButton
              pendingText="Acknowledging..."
              variant="primary"
              className="rounded-md px-4 py-2 text-sm"
            >
              Confirm — acknowledge {s.catalogued} lot(s)
            </SubmitButton>
          </form>
          <form action={rejectImport.bind(null, importId, saleId)}>
            <ConfirmSubmitButton
              title="Reject Acknowledgement?"
              description="This discards the staged acknowledgement only. The sale, Broker Invoice, and lots will remain unchanged."
              confirmLabel="Reject acknowledgement"
              className="rounded-md border border-stone-300 dark:border-stone-600 px-4 py-2 text-sm text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              Reject
            </ConfirmSubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
