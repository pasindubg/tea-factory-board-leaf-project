import { notFound } from "next/navigation";
import { reconcileValuation } from "@tea/api";
import {
  DetailField,
  DetailRecordPanel,
} from "@/components/detail-workspace";
import { EntityListTabs } from "@/components/entity-list";
import { requirePageAccess } from "@/lib/profile";
import { loadListResource } from "@/lib/list-resource-registry";
import { applyServerListSearch } from "@/lib/list-search-state";
import { stateBucket } from "../../state-buckets";
import { brokerInvoiceRank } from "../../dispatch-status";
import { formatFourDigitNo, formatSaleNo, saleNoKey, saleNoMatches } from "../../sale-number";
import { money } from "../../format";
import { DispatchesInSaleTable, type DispatchInSaleRow } from "./dispatches-in-sale-table";
import { SaleLinesTable } from "./sale-lines-table";
import { SalesSideList, type SaleSideListRow } from "./sales-side-list";
import { SalesReconciliationAssistant, type SalesReconciliationGroup } from "./sales-reconciliation-assistant";
import { SaleDetailWorkspace } from "./sale-detail-workspace";
import { SaleDocumentsTable, type SaleDocumentRow } from "./sale-documents-table";
import { DOC_TYPE_LABELS, docStatus, computeActiveDocumentIds, type AuctionDocType } from "../../doc-status";

const SEARCH_PANEL_ID = "auction-sale-detail-search";

type DispatchRow = {
  id: string;
  broker_id: string | null;
  sale_no: string;
  target_sale_no: string | null;
  dispatch_date: string | null;
  sale_date: string | null;
  prompt_date: string | null;
  status: string;
  entry_source: string | null;
  brokers: { name: string } | null;
};

type LotRow = {
  id: string;
  sale_id: string;
  invoice_no: string | null;
  provisional_sale_no: string | null;
  final_sale_no: string | null;
  lot_no: string | null;
  grade: string | null;
  bags: number | null;
  kg_per_bag: number | string | null;
  sample_allowance: number | string | null;
  net_wt: number | string | null;
  state: string | null;
  reprint_source_lot_id: string | null;
  lot_invoices: { invoice_no: string }[] | null;
};

type LineRow = {
  lot_id: string | null;
  price_per_kg: number | string | null;
  proceeds: number | string | null;
  vat_amount: number | string | null;
  on_guarantee: boolean | null;
};

type ValuationRow = {
  lot_id: string;
  price_min: number | string | null;
  price_max: number | string | null;
  projected_proceeds: number | string | null;
};

type DocImportRow = {
  id: string;
  doc_type: AuctionDocType;
  source_filename: string | null;
  status: "parsed" | "reviewed" | "confirmed" | "rejected";
  parsed_at: string | null;
  confirmed_at: string | null;
  sale_id: string | null;
  parsed_json: unknown;
};

function plural(n: number, singular: string, pluralText = `${singular}s`) {
  return `${n} ${n === 1 ? singular : pluralText}`;
}

// Human label for a broker invoice's furthest-progressed status — drives the
// "Stage" column in the Document reconciliation assistant's broker list.
const BROKER_STAGE_LABEL: Record<string, string> = {
  draft: "Draft",
  dispatched: "Draft",
  invoiced: "Invoiced",
  grn: "At GRN",
  catalogued: "Acknowledged",
  valued: "Valued",
  sold: "Sold",
  settled: "Settled",
  broker_statement: "Broker statement",
};

function lotCount(lots: LotRow[], states: readonly string[]) {
  const wanted = new Set(states);
  return lots.filter((lot) => wanted.has(lot.state ?? "")).length;
}

// A valuation confirm only ever updates auction_lots.state — auction_sales.status
// never advances past "catalogued" — so lot state, not dispatch status, is the
// only real signal that a broker's valuation (or sale) has been recorded.
const VALUED_LOT_STATES = new Set(["valued", "sold", "settled", "withdrawn", "re-print"]);

function lotIsValued(lot: LotRow) {
  return VALUED_LOT_STATES.has(lot.state ?? "");
}

function lotIsSold(lot: LotRow) {
  return lot.state === "sold" || lot.state === "settled";
}

function dispatchCount(dispatches: DispatchRow[], statuses: readonly string[]) {
  const wanted = new Set(statuses);
  return dispatches.filter((dispatch) => wanted.has(dispatch.status ?? "")).length;
}

function statusBreakdown(lots: LotRow[]) {
  const counts = new Map<string, { label: string; style: string; count: number }>();
  for (const lot of lots) {
    const raw = lot.state ?? "unknown";
    const bucket = stateBucket(raw);
    const key = bucket.label;
    const current = counts.get(key);
    if (current) current.count += 1;
    else counts.set(key, { label: bucket.label, style: bucket.style, count: 1 });
  }
  return [...counts.values()];
}

export default async function SaleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ saleNo: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { supabase, profile } = await requirePageAccess("auction-sale-detail");
  const { saleNo: rawSaleNo } = await params;
  const { tab } = await searchParams;
  const saleNo = decodeURIComponent(rawSaleNo);
  const displaySaleNo = formatSaleNo(saleNo);

  const { data: allDispatches, error: dispatchesError } = await supabase
    .from("auction_sales")
    .select("id, broker_id, sale_no, target_sale_no, dispatch_date, sale_date, prompt_date, status, entry_source, brokers(name)")
    .eq("sale_kind", "dispatch")
    .order("dispatch_date", { ascending: false });
  if (dispatchesError) throw new Error(`Could not load auction sale dispatches: ${dispatchesError.message}`);

  const allDispatchRows = (allDispatches ?? []) as unknown as DispatchRow[];
  const { data: allLots, error: lotsError } = await supabase
    .from("auction_lots")
    .select("id, sale_id, invoice_no, provisional_sale_no, final_sale_no, lot_no, grade, bags, kg_per_bag, sample_allowance, net_wt, state, reprint_source_lot_id, lot_invoices(invoice_no)")
    .order("invoice_no");
  if (lotsError) throw new Error(`Could not load auction sale lots: ${lotsError.message}`);
  const allLotRows = (allLots ?? []) as unknown as LotRow[];

  // A sale can be identified by an explicit lot assignment after reconciliation,
  // or by the target sale number on its broker invoice before that assignment is
  // present. Keep both paths so every row on the sales overview has a detail page.
  // A dispatch's own number identifies a sale ONLY when it has no target: broker
  // invoice 26B01-0020 must not leak into sale 20 when it targets sale 22.
  const assignedLotRows = allLotRows.filter((lot) =>
    saleNoMatches(lot.final_sale_no || lot.provisional_sale_no, saleNo),
  );
  const assignedDispatchIds = new Set(assignedLotRows.map((lot) => lot.sale_id));
  const dispatches = allDispatchRows.filter(
    (dispatch) =>
      assignedDispatchIds.has(dispatch.id) ||
      saleNoMatches(dispatch.target_sale_no, saleNo) ||
      (!dispatch.target_sale_no && saleNoMatches(dispatch.sale_no, saleNo)),
  );
  const dispatchIds = new Set(dispatches.map((dispatch) => dispatch.id));
  const lotRows = allLotRows.filter(
    (lot) => assignedDispatchIds.has(lot.sale_id) || dispatchIds.has(lot.sale_id),
  );

  if (dispatches.length === 0 && lotRows.length === 0) notFound();
  const saleLineResourceId = dispatches[0]?.id ?? lotRows[0]?.sale_id;

  const { data: docImports, error: docImportsError } = dispatchIds.size > 0
    ? await supabase
        .from("doc_imports")
        .select("id, doc_type, source_filename, status, parsed_at, confirmed_at, sale_id, parsed_json")
        .in("sale_id", [...dispatchIds])
        .neq("doc_type", "bank_csv")
        .order("parsed_at", { ascending: false })
    : { data: [], error: null };
  if (docImportsError) throw new Error(`Could not load sale documents: ${docImportsError.message}`);
  const docImportRows = (docImports ?? []) as unknown as DocImportRow[];
  const brokerNameByDispatchId = new Map(
    dispatches.map((dispatch) => [dispatch.id, (dispatch.brokers as { name: string } | null)?.name ?? "—"]),
  );
  const brokerIdByDispatchId = new Map(dispatches.map((dispatch) => [dispatch.id, dispatch.broker_id]));

  // A sale can have multiple brokers, each submitting their own acknowledgement/
  // valuation/contract (see saleGroupIds — reconciliation is scoped per broker
  // within the sale). So "active" tracks the latest confirmed import per
  // (doc type, broker), not per doc type across the whole sale — otherwise one
  // broker's confirmed report would wrongly supersede another broker's.
  const activeDocIds = computeActiveDocumentIds(
    docImportRows,
    (doc) => (doc.sale_id ? brokerIdByDispatchId.get(doc.sale_id) : null) ?? doc.sale_id ?? "",
  );
  const documentRows: SaleDocumentRow[] = docImportRows.map((doc) => {
    const { status, label } = docStatus(doc);
    return {
      id: doc.id,
      docType: doc.doc_type,
      docTypeLabel: DOC_TYPE_LABELS[doc.doc_type],
      filename: doc.source_filename ?? "document.pdf",
      broker: doc.sale_id ? brokerNameByDispatchId.get(doc.sale_id) ?? "—" : "—",
      status,
      statusLabel: label,
      active: activeDocIds.has(doc.id),
      uploadedAt: doc.parsed_at,
      href: `/dashboard/auction/documents/${doc.id}`,
    };
  });
  if (!saleLineResourceId) notFound();

  const { data: lines, error: linesError } = lotRows.length > 0
    ? await supabase
        .from("sale_lines")
        .select("lot_id, price_per_kg, proceeds, vat_amount, on_guarantee")
        .in("lot_id", lotRows.map((lot) => lot.id))
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (linesError) throw new Error(`Could not load auction sale lines: ${linesError.message}`);

  // Recon ② inputs (docs/AUCTION.md §4②). projected_proceeds is the broker's
  // LOW-end estimate × net weight, so a positive variance is the sale beating
  // the bottom of the valuation range.
  const { data: valuationRows, error: valuationsError } = lotRows.length > 0
    ? await supabase
        .from("valuations")
        .select("lot_id, price_min, price_max, projected_proceeds")
        .in("lot_id", lotRows.map((lot) => lot.id))
    : { data: [], error: null };
  if (valuationsError) throw new Error(`Could not load auction valuations: ${valuationsError.message}`);

  // The broker's Account Sales stack (recon ③). `net_proceeds` is proceeds
  // minus every broker charge; `total_net_proceeds` adds the output VAT the
  // broker collected from the buyer and is the figure actually credited to the
  // factory's bank on prompt date — but that VAT is then remitted to the
  // government, so it is not money the factory keeps.
  const { data: settlementRows, error: settlementsError } = dispatchIds.size > 0
    ? await supabase
        .from("settlements")
        .select("net_proceeds, total_deductions, total_net_proceeds")
        .in("sale_id", [...dispatchIds])
    : { data: [], error: null };
  if (settlementsError) throw new Error(`Could not load auction settlements: ${settlementsError.message}`);

  const lineRows = (lines ?? []) as unknown as LineRow[];
  const saleLines = await loadListResource({ key: "auction.sale-lines", params: { saleId: saleLineResourceId } });
  if (!saleLines.ok) throw new Error(saleLines.error);
  const soldLotIds = new Set<string>([
    ...(lineRows.map((line) => line.lot_id).filter(Boolean) as string[]),
    ...lotRows.filter(lotIsSold).map((lot) => lot.id),
  ]);
  const lotsByDispatch = new Map<string, LotRow[]>();
  for (const lot of lotRows) {
    const current = lotsByDispatch.get(lot.sale_id) ?? [];
    current.push(lot);
    lotsByDispatch.set(lot.sale_id, current);
  }

  const totalProceeds = lineRows.reduce((s, line) => s + Number(line.proceeds ?? 0), 0);
  const totalVat = lineRows.reduce((s, line) => s + Number(line.vat_amount ?? 0), 0);
  const guaranteeLots = lineRows.filter((line) => line.on_guarantee).length;

  // Valuation vs realised (recon ②).
  //
  // "Total valuation" is the whole sale's expectation — every lot the broker
  // has valued, whether or not it has sold yet. That is the figure that means
  // something before the sellers contract arrives.
  const valuationInputs = ((valuationRows ?? []) as ValuationRow[]).map((row) => {
    const lot = lotRows.find((candidate) => candidate.id === row.lot_id);
    return {
      lotId: row.lot_id,
      invoiceNo: lot?.invoice_no ?? "",
      grade: lot?.grade ?? "",
      netWt: Number(lot?.net_wt ?? 0),
      priceMin: row.price_min == null ? null : Number(row.price_min),
      priceMax: row.price_max == null ? null : Number(row.price_max),
      projectedProceeds: row.projected_proceeds == null ? null : Number(row.projected_proceeds),
    };
  });
  const totalValuation = valuationInputs.reduce((sum, row) => sum + (row.projectedProceeds ?? 0), 0);

  // The VARIANCE is like-for-like: reconcileValuation walks the sold lots and
  // totals only those, so proceeds are compared against the valuation of the
  // same lots. Measuring them against a valuation that also covers unsold lots
  // would report the whole unsold balance as a shortfall, which says nothing
  // about how the sale performed.
  const valuationRecon = reconcileValuation(
    valuationInputs,
    lineRows
      .filter((line): line is LineRow & { lot_id: string } => Boolean(line.lot_id))
      .map((line) => ({
        lotId: line.lot_id,
        pricePerKg: Number(line.price_per_kg ?? 0),
        proceeds: Number(line.proceeds ?? 0),
      })),
  );
  const soldValuation = valuationRecon.summary.totalProjected;
  const variance = valuationRecon.summary.totalProceeds - soldValuation;
  const varianceLabel = soldValuation === 0
    ? "—"
    : `${variance >= 0 ? "+" : "−"}LKR ${money(Math.abs(variance))} (${valuationRecon.summary.premiumPct >= 0 ? "+" : "−"}${Math.abs(valuationRecon.summary.premiumPct).toFixed(1)}%)`;
  // The two money figures are counted over DIFFERENT populations, and without
  // saying so on the field they look like they contradict each other: a sale
  // can beat its valuation on everything that sold while the whole-sale
  // valuation still exceeds proceeds, purely because some lots did not sell.
  const valuedLotsWithSale = valuationRecon.summary.lots - valuationRecon.summary.noValuation;

  // Settlements only exist once the broker's rate card has been entered, so
  // this is "—" rather than a misleading zero until then.
  const settlements = (settlementRows ?? []) as { net_proceeds: number | string | null; total_deductions: number | string | null; total_net_proceeds: number | string | null }[];
  // The factory's revenue from this sale: proceeds less the broker's whole
  // deduction stack (brokerage, insurance, handling, public sale expenses,
  // documentation, e-platform, relief loan and the VAT on those charges).
  // This is the settlement's `net_proceeds` — VAT is excluded because the
  // broker passes it through and the factory remits it to the government, so
  // it is never revenue.
  // Every charge the broker took: brokerage, insurance, public sale expenses,
  // handling, documentation, e-platform, the government relief loan, and the
  // VAT the broker charges on those charges. The rates come from the Sellers
  // Contract itself (see parseContractRates).
  const totalDeductions = settlements.reduce((sum, row) => sum + Number(row.total_deductions ?? 0), 0);
  const totalRevenue = settlements.reduce((sum, row) => sum + Number(row.net_proceeds ?? 0), 0);
  const bankCredit = settlements.reduce((sum, row) => sum + Number(row.total_net_proceeds ?? 0), 0);
  const reprintCount = lotRows.filter((lot) => lot.state === "re-print" || lot.reprint_source_lot_id).length;
  const acknowledgedCount = lotRows.filter((lot) => lot.state !== "invoiced").length;
  const valuedCount = lotCount(lotRows, ["valued", "sold", "settled", "withdrawn", "re-print"]);
  const soldCount = soldLotIds.size;
  // Weight offered in this sale, over the same lots the "Lots sold" ratio
  // counts, so the two figures always describe one population.
  const totalNetKg = lotRows.reduce((sum, lot) => sum + Number(lot.net_wt ?? 0), 0);
  // One auction sale can span several broker invoices, and they need not share
  // a sale date — show the span rather than silently picking the first.
  const saleDates = [...new Set(dispatches.map((dispatch) => dispatch.sale_date).filter(Boolean))].sort();
  const saleDateLabel = saleDates.length === 0
    ? "—"
    : saleDates.length === 1
      ? saleDates[0]
      : `${saleDates[0]} – ${saleDates[saleDates.length - 1]}`;
  const settledCount = dispatchCount(dispatches, ["settled"]);
  const invoiceEditingLocked = settledCount > 0;
  const currentStateKey =
    settledCount > 0
      ? "settled"
      : soldCount > 0
        ? "sold"
        : valuedCount > 0
          ? "valued"
          : acknowledgedCount > 0
            ? "acknowledged"
            : "draft";
  const lifecycleSteps = [
    { key: "draft", label: "Draft", metric: plural(lotRows.length, "lot") },
    { key: "acknowledged", label: "Acknowledged", metric: `${acknowledgedCount}/${lotRows.length} lots` },
    { key: "valued", label: "Valued", metric: `${valuedCount}/${lotRows.length} lots` },
    { key: "sold", label: "Sold", metric: plural(soldCount, "lot") },
    {
      key: "settled",
      label: "Settled",
      metric: settledCount > 0 ? plural(settledCount, "broker invoice", "broker invoices") : "Pending",
    },
  ];
  const issueSteps = [
    { label: "Pending", count: lotCount(lotRows, ["pending"]) },
    { label: "Not Valued", count: lotCount(lotRows, ["not-valued"]) },
    { label: "Shutout", count: lotCount(lotRows, ["shutout"]) },
    { label: "Withdrawn", count: lotCount(lotRows, ["withdrawn"]) },
    { label: "Re-print", count: lotRows.filter((lot) => lot.state === "re-print" || lot.reprint_source_lot_id).length },
    { label: "Missing", count: lotCount(lotRows, ["missing"]) },
  ].filter((item) => item.count > 0);
  // Shared with the side rail's own client-side refetch on search — one
  // source of truth for the sale-grouping aggregation instead of duplicating
  // it here for the initial render.
  const saleListResource = await loadListResource({ key: "auction.sales-side-list" });
  if (!saleListResource.ok) throw new Error(saleListResource.error);
  const saleListRows: SaleSideListRow[] = saleListResource.rows;

  const dispatchTableRows: DispatchInSaleRow[] = dispatches.map((dispatch) => {
    const state = stateBucket(dispatch.status);
    const dispatchLots = lotsByDispatch.get(dispatch.id) ?? [];
    return {
      id: dispatch.id,
      saleNo: formatFourDigitNo(dispatch.sale_no),
      broker: (dispatch.brokers as { name: string } | null)?.name ?? "—",
      dispatchDate: dispatch.dispatch_date,
      saleDate: dispatch.sale_date,
      lotsCount: dispatchLots.length,
      statusChips: statusBreakdown(dispatchLots),
      soldLots: dispatchLots.filter((lot) => soldLotIds.has(lot.id)).length,
      reprintLots: dispatchLots.filter((lot) => lot.state === "re-print" || lot.reprint_source_lot_id).length,
      statusLabel: state.label,
      statusStyle: state.style,
      entrySource: dispatch.entry_source,
    };
  });

  type ReconciliationGroupBuild = SalesReconciliationGroup & { dispatchRank: number; dispatchStageLabel: string };
  const reconciliationGroupsByBroker = new Map<string, ReconciliationGroupBuild>();
  for (const dispatch of dispatches) {
    const broker = (dispatch.brokers as { name: string } | null)?.name ?? "—";
    const key = dispatch.broker_id ?? broker;
    const current = reconciliationGroupsByBroker.get(key) ?? {
      saleId: dispatch.id,
      broker,
      dispatchNos: [],
      lotCount: 0,
      ackDone: false,
      valuationDone: false,
      soldDone: false,
      stageLabel: "Draft",
      dispatchRank: -1,
      dispatchStageLabel: "Draft",
    };
    current.dispatchNos.push(formatFourDigitNo(dispatch.sale_no));
    const dispatchLots = lotsByDispatch.get(dispatch.id) ?? [];
    current.lotCount += dispatchLots.length;
    // A single dispatch reaching "catalogued" means the broker's ack covers
    // the whole group (it's uploaded once per broker, not once per dispatch).
    // Ack confirmation is the only step that still moves auction_sales.status;
    // valuation/sale progress only ever shows up on the lots themselves.
    const dispatchRank = brokerInvoiceRank(dispatch.status);
    if (dispatchRank >= brokerInvoiceRank("catalogued")) current.ackDone = true;
    if (dispatchRank > current.dispatchRank) {
      current.dispatchRank = dispatchRank;
      current.dispatchStageLabel = BROKER_STAGE_LABEL[dispatch.status] ?? dispatch.status;
    }
    if (dispatchLots.some(lotIsValued)) current.valuationDone = true;
    if (dispatchLots.some(lotIsSold)) current.soldDone = true;
    reconciliationGroupsByBroker.set(key, current);
  }
  for (const group of reconciliationGroupsByBroker.values()) {
    group.stageLabel = group.soldDone ? "Sold" : group.valuationDone ? "Valued" : group.ackDone ? "Acknowledged" : group.dispatchStageLabel;
  }
  const reconciliationGroups = [...reconciliationGroupsByBroker.values()].sort((a, b) => a.broker.localeCompare(b.broker));

  const saleLineTableRows = saleLines.rows;

  const [visibleSaleListRows, visibleDispatchTableRows, visibleDocumentRows] = await Promise.all([
    applyServerListSearch(supabase, profile, "auction-sales-side-list", saleListRows),
    applyServerListSearch(supabase, profile, "dispatches-in-sale", dispatchTableRows),
    applyServerListSearch(supabase, profile, "auction-sale-documents", documentRows),
  ]);

  return (
    <SaleDetailWorkspace
      saleNo={displaySaleNo}
      isOwner={profile.role === "owner"}
      saleListRows={saleListRows}
      rail={
        <SalesSideList
          rows={visibleSaleListRows}
          currentSaleNo={displaySaleNo}
          searchPanelId={SEARCH_PANEL_ID}
        />
      }
      railAriaLabel="Auction sales"
      searchPanelId={SEARCH_PANEL_ID}
      state={{
        currentKey: currentStateKey,
        steps: lifecycleSteps,
        testId: "sale-state-indicator",
      }}
      headerActions={
        <SalesReconciliationAssistant
          saleNo={displaySaleNo}
          groups={reconciliationGroups}
        />
      }
    >
      <DetailRecordPanel
        eyebrow="Sale details"
        title={`Sale ${displaySaleNo}`}
        description={`${plural(dispatches.length, "broker invoice")} · ${plural(lotRows.length, "lot")} · ${soldCount} sold · ${reprintCount} re-print`}
        contentClassName="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-4"
        footer={
          issueSteps.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {issueSteps.map((item) => (
                <span
                  key={item.label}
                  className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                >
                  {item.label}: {item.count}
                </span>
              ))}
            </div>
          ) : undefined
        }
      >
        <DetailField label="Sale date" value={saleDateLabel} />
        <DetailField label="Total kg to sale" value={`${totalNetKg.toFixed(2)} kg`} />
        <DetailField label="Lots sold" value={`${soldCount}/${lotRows.length}`} />
        <DetailField
          label={valuationInputs.length === 0 ? "Total valuation" : `Total valuation (${valuationInputs.length} valued)`}
          value={valuationInputs.length === 0 ? "—" : `LKR ${money(totalValuation)}`}
        />
        {/* The valuation of the SOLD lots only — the figure "Total proceeds"
            is actually measured against, and the basis of the variance. */}
        <DetailField
          label="Sales valuation"
          value={valuedLotsWithSale === 0 ? "—" : `LKR ${money(soldValuation)}`}
        />
        {/* Proceeds are the hammer value: net kg x price/kg, BEFORE VAT and
            the broker's deductions. VAT is charged to the buyer on top of
            this, never taken out of it (docs/AUCTION.md section 1). */}
        <DetailField label="Total proceeds (before VAT)" value={`LKR ${money(totalProceeds)}`} />
        {/* Average hammer price per kg offered: proceeds ÷ total kg to sale. */}
        <DetailField
          label="Average/kg"
          value={totalNetKg === 0 ? "—" : `LKR ${money(totalProceeds / totalNetKg)}`}
        />
        {/* Sold lots against their OWN valuation — the counts are on both
            labels because the two populations differ whenever a lot is
            unsold, which otherwise reads as a contradiction. */}
        <DetailField
          label={valuedLotsWithSale === 0 ? "Valuation variance" : `Valuation variance (${valuedLotsWithSale} sold)`}
          value={varianceLabel}
        />
        {/* The broker's complete deduction stack, so the panel reads as the
            arithmetic it is: proceeds − deductions = revenue. */}
        <DetailField
          label="Total deductions"
          value={settlements.length === 0 ? "—" : `LKR ${money(totalDeductions)}`}
        />
        {/* Revenue earned from this sale: proceeds less every broker charge.
            VAT is excluded on purpose — the broker credits it with the payment
            but it is the government's, remitted on return. */}
        <DetailField
          label="Total revenue"
          value={settlements.length === 0 ? "—" : `LKR ${money(totalRevenue)}`}
        />
        {/* Revenue kept per kg offered: revenue ÷ total kg to sale. */}
        <DetailField
          label="Revenue/kg"
          value={settlements.length === 0 || totalNetKg === 0 ? "—" : `LKR ${money(totalRevenue / totalNetKg)}`}
        />
        {/* The literal credit on prompt date. It is net proceeds PLUS the
            output VAT the broker collected, so it is larger than what the
            factory keeps once that VAT is remitted. */}
        <DetailField
          label="Bank credit (prompt)"
          value={settlements.length === 0 ? "—" : `LKR ${money(bankCredit)}`}
        />
        <DetailField label="Total VAT" value={`LKR ${money(totalVat)}`} />
        <DetailField label="Guarantee lots" value={guaranteeLots} />
      </DetailRecordPanel>
      <EntityListTabs
        label="Sale lists"
        defaultTab={tab === "documents" ? "documents" : undefined}
        tabs={[
          {
            id: "lots",
            label: "Lots & invoices",
            count: `${saleLineTableRows.length} lots`,
            content: (
              <SaleLinesTable
                saleId={saleLineResourceId}
                rows={saleLineTableRows}
                canManage={profile.role === "owner" && !invoiceEditingLocked}
              />
            ),
          },
          { id: "dispatches", label: "Broker invoices", count: `${visibleDispatchTableRows.length} broker invoices`, content: <DispatchesInSaleTable rows={visibleDispatchTableRows} /> },
          { id: "documents", label: "Documents", count: `${visibleDocumentRows.length} documents`, content: <SaleDocumentsTable rows={visibleDocumentRows} /> },
        ]}
      />
    </SaleDetailWorkspace>
  );
}
