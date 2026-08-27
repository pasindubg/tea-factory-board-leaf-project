import { SubmitButton } from "@/components/submit-button";
import { ConfirmSubmitButton } from "@/components/confirmation-dialog";
import {
  carryForwardInvoiceFilters,
  invoiceMatchKey,
  reconcileAcknowledgement,
  relateAcknowledgementParseWarnings,
  type ParsedAcknowledgement,
  type ReconStatus,
} from "@tea/api";
import { confirmAcknowledgement, rejectImport } from "@/app/dashboard/auction/actions";
import { buildInvoicedLots } from "@/app/dashboard/auction/recon-helpers";
import { canonicalGrade, gradeAliasMap, saleGroupIds } from "@/app/dashboard/auction/_actions/_shared";
import { formatFourDigitNo, formatSaleNo } from "@/app/dashboard/auction/sale-number";
import { resolveAckCarryForward, type CarryForwardOutcome } from "@/app/dashboard/auction/_actions/carry-forward";
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
    .select("id, sale_id, invoice_no, grade, net_wt, sample_allowance, state, lot_no, lot_source, reprint, reprint_registered, marks(code), lot_invoices(invoice_no)")
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
  const confirmedDoc = imp.status === "confirmed";

  // reconcileAcknowledgement only knows the lots invoiced in THIS sale group,
  // so a lot carried forward from an earlier broker invoice — including a
  // re-print registered at cutover — arrives here with no `invoiced` side.
  // Resolving it against the register is what lets the screen say WHY the row
  // has no invoice of ours (a re-print, a roll-forward, or genuinely unknown).
  // This is the same call confirmAcknowledgement makes, so the preview cannot
  // promise one outcome and confirmation perform another.
  //
  // NONE of this applies once the document is confirmed. Carry-forward resolves
  // against the CURRENT location of a lot, not where it was when this document
  // was applied — a lot this ack shut out can be moved into a LATER sale by
  // that later sale's own confirm, which then makes it vanish from THIS sale's
  // group entirely. Re-running carry-forward here would search for it again
  // using today's lot positions and either find nothing (even though the
  // document plainly shows it was shut out) or attribute it to
  // whatever it has since become. A confirmed document is history: what it
  // shows for a row is what the row's own printed section said, not a live
  // re-match.
  // In the acknowledgement, with no invoice of ours behind it.
  const ackOnlyRows = recon.rows.filter((row) => row.ack && !row.invoiced);
  const { data: groupSaleRows } = await supabase.from("auction_sales").select("broker_id").in("id", groupIds).limit(1);
  const brokerId = (groupSaleRows ?? [])[0]?.broker_id as string | null ?? null;
  const carryForward: Map<string, CarryForwardOutcome> = confirmedDoc
    ? new Map()
    : await resolveAckCarryForward(supabase, profile.factory_id, {
        groupIds,
        brokerId,
        rows: ackOnlyRows.map((row) => ({ invoiceNo: row.invoiceNo, lotNo: row.ack?.lotNo ?? null })),
      });
  // The document's own printed outcome for an invoice, keyed the same way
  // reconciliation matches — used to restore a confirmed row's real section
  // when the lot behind it has since moved to a later sale.
  const sectionByInvoice = new Map(parsed.lots.map((lot) => [invoiceMatchKey(lot.invoiceNo), lot.section]));

  // A confirmed row whose lot has since moved on still has ITS OWN invoice
  // number stored somewhere in the factory's records (composite prefix and
  // all) — just not under this sale's group any more. Look it up broker-wide,
  // purely to show the same number its sibling rows show, not to re-derive
  // any outcome.
  const historicalInvoiceNos = confirmedDoc
    ? ackOnlyRows
        .filter((row) => sectionByInvoice.has(invoiceMatchKey(row.invoiceNo)))
        .map((row) => row.invoiceNo)
    : [];
  const { data: movedLots } = historicalInvoiceNos.length > 0 && brokerId
    ? await supabase
        .from("auction_lots")
        .select("invoice_no, lot_invoices(invoice_no), auction_sales!inner(broker_id)")
        .eq("auction_sales.broker_id", brokerId)
        // Narrowed to the invoices actually being looked up. Without this the
        // query pulled every lot the broker has ever held, to read a handful of
        // numbers. Prefix-aware, because the factory stores "26I02-0909" where
        // the broker prints "0909".
        .or(carryForwardInvoiceFilters(historicalInvoiceNos.map(formatFourDigitNo)).join(","))
    : { data: [] };
  const movedInvoiceByKey = new Map(
    (movedLots ?? []).flatMap((lot) => {
      const aliases = (lot.lot_invoices as { invoice_no: string }[] | null) ?? [];
      const numbers = aliases.length > 0 ? aliases.map((a) => a.invoice_no) : [lot.invoice_no as string];
      return numbers.map((n) => [invoiceMatchKey(n), formatFourDigitNo(n)] as const);
    }),
  );

  // The lot a confirmed acknowledgement created for a row it could not place.
  // Registering a re-print acts on that lot, so it only exists after confirm.
  const ackLotByInvoice = new Map(
    (lotRows ?? [])
      .filter((lot) => lot.lot_source === "acknowledgement")
      .map((lot) => [invoiceMatchKey(lot.invoice_no as string | null), lot]),
  );

  const reviewRows: ReviewReconRow[] = recon.rows.map((row) => {
    const ackLot = ackLotByInvoice.get(invoiceMatchKey(row.invoiceNo));
    // On a confirmed document, a missing `invoiced` side usually only means the
    // lot this row applied to has since moved to a later sale — not that it was
    // ever unresolved. What happened is what this document itself printed.
    const historicalSection = confirmedDoc && row.ack && !row.invoiced
      ? sectionByInvoice.get(invoiceMatchKey(row.invoiceNo))
      : undefined;
    const registration = {
      lotId: (ackLot?.id as string | undefined) ?? null,
      reprintRegistered: Boolean(ackLot?.reprint_registered),
      // Registering does not need the lot to exist: it records the EARLIER
      // sale's lot, which the carry-forward resolver then links on confirm.
      // Not offered once the row is settled history (confirmedDoc).
      canRegister: !confirmedDoc && Boolean(row.ack) && !row.invoiced && !ackLot?.reprint,
    };
    if (historicalSection) {
      return {
        ...row,
        ...registration,
        // The factory's own composite number for this invoice, wherever the
        // lot lives now — same identity, just properly formatted.
        invoiceNo: movedInvoiceByKey.get(invoiceMatchKey(row.invoiceNo)) ?? row.invoiceNo,
        // Nothing on the live lot still reflects what was invoiced under THIS
        // sale — it has since been overwritten by wherever the lot moved to.
        // The document's own printed figures for the row are the only record
        // of that left, so show those rather than a blank "—".
        invoiced: row.ack ? { id: row.invoiced?.id ?? "", grade: row.ack.grade, netWt: row.ack.netWt } : row.invoiced,
        display: historicalSection,
        carryForwardNote: null,
      };
    }
    const outcome = row.ack && !row.invoiced ? carryForward.get(row.invoiceNo) : undefined;
    if (outcome?.status === "matched") {
      const fromInvoice = formatFourDigitNo(outcome.lot.auction_sales?.sale_no ?? null) || "—";
      const fromSale = formatSaleNo(outcome.lot.auction_sales?.target_sale_no ?? null) || fromInvoice;
      const lot = outcome.lot;
      const lotAliases = (lot.lot_invoices ?? []).map((invoice) => formatFourDigitNo(invoice.invoice_no)).filter(Boolean);
      const lotNetWt = lot.net_wt == null ? null : Number(lot.net_wt);
      const lotSample = Number(lot.sample_allowance ?? 0);
      return {
        ...row,
        ...registration,
        // The matched lot is the factory's own earlier record for this
        // invoice — show ITS number/grade/weight, same as any other
        // invoiced row, instead of the un-prefixed number the broker prints.
        invoiceNo: lotAliases.length > 0 ? lotAliases.join(", ") : (formatFourDigitNo(lot.invoice_no) || row.invoiceNo),
        invoiced: lotNetWt == null ? row.invoiced : { id: lot.id, grade: lot.grade ?? "", netWt: lotNetWt },
        weightDelta: row.ack && lotNetWt != null ? Number((row.ack.netWt - (lotNetWt + lotSample)).toFixed(2)) : row.weightDelta,
        // The matched lot IS the registered re-print (or the unsold lot the
        // carry-forward found) — no new lot exists yet to read the flag off
        // of, so state the fact this match itself represents.
        reprintRegistered: outcome.isReprint,
        canRegister: false,
        display: outcome.isReprint ? "re-print" : "rolled forward",
        carryForwardNote: outcome.isReprint
          ? `Offered in sale ${fromSale} (broker invoice ${fromInvoice}) and did not sell — added here as a re-print`
          : `Never offered in sale ${fromSale} — that sale is flagged as skipped and stops counting it; added here as a normal lot`,
      };
    }
    if (outcome?.status === "blocked") {
      const fromInvoice = formatFourDigitNo(outcome.lot.auction_sales?.sale_no ?? null) || "—";
      return { ...row, ...registration, canRegister: false, display: row.status, carryForwardNote: `Matches a sold/settled lot on broker invoice ${fromInvoice} — resolve by hand` };
    }
    return { ...row, ...registration, display: row.status, carryForwardNote: null };
  });

  const order: Record<ReviewReconRow["display"], number> = {
    "not-acknowledged": 0, "re-print": 1, "rolled forward": 2, shutout: 3, catalogued: 4,
  };

  // ── Orphan-resolver inputs (#19) ──
  // Orphans = invoiced lots this ack never mentioned (drop ones already resolved
  // by a manual link/mark). Candidates = ack lots with no invoice of ours, not
  // yet consumed (their lot_no isn't already on an acknowledged lot in the DB).
  const lotById = new Map((lotRows ?? []).map((l) => [l.id as string, l]));
  const cataloguedLotNos = new Set(
    (lotRows ?? [])
      .filter((l) => ["acknowledged", "valued", "sold"].includes(l.state as string) && l.lot_no)
      .map((l) => l.lot_no as string),
  );
  const markOf = (id: string) => (lotById.get(id)?.marks as unknown as { code: string } | null)?.code ?? null;
  const orphans: Orphan[] = recon.rows
    .filter((r) => r.status === "not-acknowledged" && r.invoiced)
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
    .filter((r) => r.ack && !r.invoiced && !r.carryForwardNote && !cataloguedLotNos.has(r.ack.lotNo ?? ""))
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
  // Counted off reviewRows, not recon.summary: the chip must match what the
  // table LABELS, or it reads 0 while rows below it plainly say otherwise.
  const notAcknowledged = shown("not-acknowledged");
  // Acknowledged rows still waiting on a human: no invoice of ours, and the
  // register/carry-forward could not account for them either.
  const notInvoiced = reviewRows.filter((row) => row.ack && !row.invoiced && !row.carryForwardNote).length;
  const chips: [string, number, string][] = [
    ["Acknowledged", s.catalogued, "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-400"],
    ["Shutout", s.shutout, "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-400"],
    ["Not acknowledged", notAcknowledged, "bg-sky-100 dark:bg-sky-900 text-sky-800 dark:text-sky-300"],
    ...(reprints > 0 ? [["Re-print", reprints, "bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-300"] as [string, number, string]] : []),
    // Acknowledged, but we hold no invoice for it. Not an error and not a
    // status — a decision waiting on the operator, who either registers it as
    // a re-print or resolves it in Compare.
    ...(notInvoiced > 0
      ? [["Not invoiced", notInvoiced, "bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300"] as [string, number, string]]
      : []),
    ["Weight mismatches", s.weightMismatches, "bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300"],
    // Excluded from the count above, not folded into it as a silent "0": a row
    // whose lot has since moved to a later sale has nothing left on our side
    // to compare THIS document's weight against, for either broker.
    ...(confirmedDoc && ackOnlyRows.length > 0
      ? [["Not re-checked", ackOnlyRows.length, "bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400"] as [string, number, string]]
      : []),
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
        {Math.abs(s.totalMismatchKg) > 0.01 && (
          <span className="rounded-full bg-red-50 dark:bg-red-950 px-3 py-1 text-sm text-red-700 dark:text-red-400">
            Catalogued total mismatch: {s.totalMismatchKg > 0 ? "+" : ""}{s.totalMismatchKg.toFixed(2)} kg
          </span>
        )}
        {s.notAcknowledged > 0 && (
          <span className="rounded-full bg-sky-50 dark:bg-sky-950 px-3 py-1 text-sm text-sky-700 dark:text-sky-300">
            {s.notAcknowledgedKg.toFixed(2)} kg invoiced, not yet acknowledged
          </span>
        )}
      </div>

      {/* Compare & resolve — link an un-acknowledged invoice to a catalogue lot. */}
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
