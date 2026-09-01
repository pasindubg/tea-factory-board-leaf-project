import { notFound } from "next/navigation";
import { reconcileValuation } from "@tea/api";
import { loadSaleRevenueCheck } from "../../_actions/revenue-check";
import {
  DetailField,
  DetailRecordPanel,
} from "@/components/detail-workspace";
import { EntityListTabs } from "@/components/entity-list";
import { requirePageAccess } from "@/lib/profile";
import { loadListResource } from "@/lib/list-resource-registry";
import { applyServerListSearch } from "@/lib/list-search-state";
import { brokerSaleKey, isNotValuedLot, isUnsoldLot, soldBrokerSaleKeys, stateBucket, valuedBrokerSaleKeys } from "../../state-buckets";
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
  shutout: boolean | null;
  unsold: boolean | null;
  reprint: boolean | null;
  withdrawn: boolean | null;
  not_valued: boolean | null;
  missing: boolean | null;
  settled: boolean | null;
  skipped_sale: boolean | null;
  skipped_sale_no: string | null;
  reprint_source_lot_id: string | null;
  lot_invoices: { invoice_no: string }[] | null;
};

/**
 * The lot left this sale: the broker catalogued it in the sale named by
 * `skipped_sale_no`, and a row for it exists there. It stays visible here as
 * history but must not count towards this sale's weight, lots or money.
 *
 * The arriving row in the destination sale is `skipped_sale` too, with NO
 * number — that one belongs here and counts normally. The number is the whole
 * distinction, so setting it later removes the lot from these totals.
 */
const skippedAway = (lot: { skipped_sale?: boolean | null; skipped_sale_no?: string | null }) =>
  Boolean(lot.skipped_sale) && Boolean(lot.skipped_sale_no);

type LineRow = {
  lot_id: string | null;
  // The contract's own weight for the sold lot — the weight the proceeds were
  // actually struck on, which is what an average price must divide by.
  net_wt: number | string | null;
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

// Human label for a dispatch invoice's furthest-progressed status — drives the
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
const VALUED_LOT_STATES = new Set(["valued", "sold"]);

function lotIsValued(lot: LotRow) {
  return VALUED_LOT_STATES.has(lot.state ?? "");
}

function lotIsSold(lot: LotRow) {
  return lot.state === "sold";
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
    .select("id, sale_id, invoice_no, provisional_sale_no, final_sale_no, lot_no, grade, bags, kg_per_bag, sample_allowance, net_wt, state, shutout, shutout_reason, unsold, reprint, withdrawn, not_valued, missing, settled, skipped_sale, skipped_sale_no, reprint_source_lot_id, lot_invoices(invoice_no)")
    .order("invoice_no");
  if (lotsError) throw new Error(`Could not load auction sale lots: ${lotsError.message}`);
  const allLotRows = (allLots ?? []) as unknown as LotRow[];

  // A sale can be identified by an explicit lot assignment after reconciliation,
  // or by the target sale number on its dispatch invoice before that assignment is
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
  // Every lot this sale holds, including ones that have since skipped away —
  // membership, used for "does this sale exist" and for resolving its invoice.
  const saleLotRows = allLotRows.filter(
    (lot) => assignedDispatchIds.has(lot.sale_id) || dispatchIds.has(lot.sale_id),
  );
  // What this sale actually counts. Everything below derives from it, so the
  // exclusion applies once and reaches every figure on the page.
  const lotRows = saleLotRows.filter((lot) => !skippedAway(lot));

  // Membership, not totals: a sale whose every lot skipped away still exists.
  if (dispatches.length === 0 && saleLotRows.length === 0) {
    // A sale number that matches nothing is a bad URL — 404 it. But when the
    // factory has no auction data AT ALL there is no sale to have asked for,
    // and the nav still links here, so show the page empty rather than 404.
    if (allDispatchRows.length > 0 || allLotRows.length > 0) notFound();
    return (
      <DetailRecordPanel
        eyebrow="Sale details"
        title="No auction sales yet"
        description="A sale appears here once a dispatch invoice is created and dispatched."
      >
        <DetailField label="Dispatch invoices" value="0" />
        <DetailField label="Lots" value="0" />
      </DetailRecordPanel>
    );
  }
  // The Invoices tab re-derives its sale from this dispatch invoice's own target,
  // so it must be one that BELONGS to this sale. A dispatch pulled in only
  // because one of its lots was assigned here (a re-print register entry, say)
  // targets a different sale, and picking it emptied the tab down to that lot.
  const saleLineResourceId =
    dispatches.find((dispatch) => saleNoMatches(dispatch.target_sale_no, saleNo))?.id
    ?? dispatches.find((dispatch) => !dispatch.target_sale_no && saleNoMatches(dispatch.sale_no, saleNo))?.id
    ?? dispatches[0]?.id
    ?? saleLotRows[0]?.sale_id;

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
        .select("lot_id, net_wt, price_per_kg, proceeds, vat_amount, on_guarantee")
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
  // The weight those proceeds were struck on. Both halves of the average come
  // from sale_lines, so it is a true weighted average price per kg SOLD —
  // dividing sold money by the whole sale's weight (unsold and shutout tea
  // included) is not an average price, and never matches the broker's.
  const soldNetKg = lineRows.reduce((s, line) => s + Number(line.net_wt ?? 0), 0);
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
  // Re-validation: our recomputed revenue against what the brokers' contracts
  // actually printed. Only meaningful once every contract for the sale is in.
  const revenueCheck = await loadSaleRevenueCheck(supabase, profile.factory_id, [...dispatchIds], totalRevenue);
  const bankCredit = settlements.reduce((sum, row) => sum + Number(row.total_net_proceeds ?? 0), 0);
  // The `reprint` flag and nothing else. Keying on the source link counted
  // skipped sales too — they used to share that column — and reported
  // "Re-prints sold: 3" on a sale holding no re-prints at all.
  // The warning chips describe the lots the Sale lines table LISTS, which
  // keeps lots that skipped away to a later sale. Counting them over `lotRows`
  // (money/weight totals, skipped lots excluded) silently hid a shutout and
  // not-valued lot from the chips while the table showed it.
  const issueLotRows = saleLotRows;
  const reprintsSoldCount = issueLotRows.filter((lot) => lot.reprint && soldLotIds.has(lot.id)).length;
  // Broker + sale: a sold lot for the same broker in the same sale is what
  // makes "did not sell" knowable for anything of theirs still valued.
  const brokerBySaleId = new Map(allDispatchRows.map((d) => [d.id, d.broker_id]));
  const saleNoBySaleId = new Map(allDispatchRows.map((d) => [d.id, d.target_sale_no ?? d.sale_no]));
  const groupOf = (lot: LotRow) => brokerSaleKey(brokerBySaleId.get(lot.sale_id), saleNoBySaleId.get(lot.sale_id));
  const soldGroups = soldBrokerSaleKeys(allLotRows.map((lot) => ({
    state: lot.state,
    brokerId: brokerBySaleId.get(lot.sale_id) ?? null,
    saleNo: saleNoBySaleId.get(lot.sale_id) ?? null,
  })));
  const notSoldCount = issueLotRows.filter((lot) => isUnsoldLot(lot, soldGroups.has(groupOf(lot)))).length;
  const valuedGroups = valuedBrokerSaleKeys(allLotRows.map((lot) => ({
    state: lot.state,
    brokerId: brokerBySaleId.get(lot.sale_id) ?? null,
    saleNo: saleNoBySaleId.get(lot.sale_id) ?? null,
  })));
  const notValuedCount = issueLotRows.filter((lot) => isNotValuedLot(lot, valuedGroups.has(groupOf(lot)))).length;
  const acknowledgedCount = lotRows.filter((lot) => lot.state !== "invoiced").length;
  const valuedCount = lotCount(lotRows, ["valued", "sold"]);
  const soldCount = soldLotIds.size;
  // Weight offered in this sale, over the same lots the "Lots sold" ratio
  // counts, so the two figures always describe one population.
  const totalNetKg = lotRows.reduce((sum, lot) => sum + Number(lot.net_wt ?? 0), 0);
  // One auction sale can span several dispatch invoices, and they need not share
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
      metric: settledCount > 0 ? plural(settledCount, "dispatch invoice", "dispatch invoices") : "Pending",
    },
  ];
  const flagCount = (flag: keyof LotRow) => issueLotRows.filter((lot) => lot[flag]).length;
  const issueSteps = [
    { label: "Not Valued", count: notValuedCount },
    { label: "Shutout", count: flagCount("shutout") },
    { label: "Withdrawn", count: flagCount("withdrawn") },
    { label: "Not sold", count: notSoldCount },
    { label: "Re-print lots", count: flagCount("reprint") },
    { label: "Re-prints sold", count: reprintsSoldCount },
    { label: "Missing", count: flagCount("missing") },
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
      reprintLots: dispatchLots.filter((lot) => lot.reprint || lot.reprint_source_lot_id).length,
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
      valuationConfirmed: false,
      contractConfirmed: false,
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
    // A confirmed document locks every earlier one for this broker, exactly as
    // documentOrderBlockedReason does on the server.
    for (const doc of docImportRows) {
      if (doc.sale_id !== dispatch.id || doc.status !== "confirmed") continue;
      if (doc.doc_type === "valuation") current.valuationConfirmed = true;
      if (doc.doc_type === "contract") current.contractConfirmed = true;
    }
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
        description={`${plural(dispatches.length, "dispatch invoice")} · ${plural(lotRows.length, "lot")} · ${soldCount} sold · ${notSoldCount} not sold`}
        contentClassName="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-4"
        footer={
          issueSteps.length > 0 || revenueCheck.status !== "pending" && revenueCheck.status !== "unavailable" ? (
            <div className="flex flex-wrap items-center gap-2">
              {issueSteps.map((item) => (
                <span
                  key={item.label}
                  className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                >
                  {item.label}: {item.count}
                </span>
              ))}
              {/* Re-validation against the brokers' own sellers contracts. Shown
                  only once every contract for the sale is confirmed — see
                  validateSaleRevenue. */}
              {revenueCheck.status === "tallied" && (
                <span
                  data-testid="revenue-tallied"
                  title={`Total revenue LKR ${money(revenueCheck.computed)} matches the net proceeds printed on ${revenueCheck.documents} sellers contract(s).`}
                  className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800 dark:bg-green-950 dark:text-green-300"
                >
                  ✓ Tallied with {revenueCheck.documents} sellers contract{revenueCheck.documents === 1 ? "" : "s"}
                </span>
              )}
              {revenueCheck.status === "tallied-on-printed-insurance" && (
                <span
                  data-testid="revenue-tallied-insurance"
                  title={`Every other charge agrees. The contract charges LKR ${money(revenueCheck.printedInsurance)} insurance where this sale calculates LKR ${money(revenueCheck.computedInsurance)}.`}
                  className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                >
                  Tallied — insurance differs by LKR {money(Math.abs(revenueCheck.insuranceDifference))}
                </span>
              )}
              {revenueCheck.status === "mismatch" && (
                <span
                  data-testid="revenue-mismatch"
                  title={`Ours LKR ${money(revenueCheck.computed)} vs the contracts' LKR ${money(revenueCheck.printed)}.`}
                  className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-300"
                >
                  ⚠ Off the sellers contracts by LKR {money(Math.abs(revenueCheck.difference))}
                  {revenueCheck.difference > 0 ? " (we are higher)" : " (we are lower)"}
                </span>
              )}
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
        {/* Average hammer price of the tea that SOLD: proceeds ÷ the weight
            those proceeds were struck on. Both sides cover the same lots, so
            it is comparable with the broker's own average. */}
        <DetailField
          label="Average/kg (sold)"
          value={soldNetKg === 0 ? "—" : `LKR ${money(totalProceeds / soldNetKg)}`}
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
        {/* Revenue kept per kg SOLD. net_proceeds is what the sold tea earned
            after the broker's charges, so the same lots must be on both sides —
            exactly as for Average/kg above. Tea that did not sell earned
            nothing and had nothing deducted; including its weight measures
            neither the price achieved nor the cost of achieving it. */}
        <DetailField
          label="Revenue/kg (sold)"
          value={settlements.length === 0 || soldNetKg === 0 ? "—" : `LKR ${money(totalRevenue / soldNetKg)}`}
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
          { id: "dispatches", label: "Dispatch invoices", count: `${visibleDispatchTableRows.length} dispatch invoices`, content: <DispatchesInSaleTable rows={visibleDispatchTableRows} /> },
          { id: "documents", label: "Documents", count: `${visibleDocumentRows.length} documents`, content: <SaleDocumentsTable rows={visibleDocumentRows} /> },
        ]}
      />
    </SaleDetailWorkspace>
  );
}
