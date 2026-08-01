import { notFound } from "next/navigation";
import {
  DetailField,
  DetailRecordPanel,
} from "@/components/detail-workspace";
import { EntityListTabs } from "@/components/entity-list";
import { requirePageAccess } from "@/lib/profile";
import { loadListResource } from "@/lib/list-resource-registry";
import { applyServerListSearch } from "@/lib/list-search-state";
import { stateBucket } from "../../state-buckets";
import { formatFourDigitNo, formatSaleNo, saleNoKey, saleNoMatches } from "../../sale-number";
import { money } from "../../format";
import { DispatchesInSaleTable, type DispatchInSaleRow } from "./dispatches-in-sale-table";
import { SaleLinesTable } from "./sale-lines-table";
import { SalesSideList, type SaleSideListRow } from "./sales-side-list";
import { SalesReconciliationAssistant, type SalesReconciliationGroup } from "./sales-reconciliation-assistant";
import { SaleDetailWorkspace } from "./sale-detail-workspace";

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
  proceeds: number | string | null;
  vat_amount: number | string | null;
  on_guarantee: boolean | null;
};

function plural(n: number, singular: string, pluralText = `${singular}s`) {
  return `${n} ${n === 1 ? singular : pluralText}`;
}

function lotCount(lots: LotRow[], states: readonly string[]) {
  const wanted = new Set(states);
  return lots.filter((lot) => wanted.has(lot.state ?? "")).length;
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
}: {
  params: Promise<{ saleNo: string }>;
}) {
  const { supabase, profile } = await requirePageAccess("auction-sale-detail");
  const { saleNo: rawSaleNo } = await params;
  const saleNo = decodeURIComponent(rawSaleNo);
  const displaySaleNo = formatSaleNo(saleNo);

  const { data: allDispatches, error: dispatchesError } = await supabase
    .from("auction_sales")
    .select("id, broker_id, sale_no, target_sale_no, dispatch_date, sale_date, prompt_date, status, brokers(name)")
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
  const assignedLotRows = allLotRows.filter((lot) =>
    saleNoMatches(lot.final_sale_no || lot.provisional_sale_no, saleNo),
  );
  const assignedDispatchIds = new Set(assignedLotRows.map((lot) => lot.sale_id));
  const dispatches = allDispatchRows.filter(
    (dispatch) =>
      assignedDispatchIds.has(dispatch.id) ||
      saleNoMatches(dispatch.target_sale_no, saleNo) ||
      saleNoMatches(dispatch.sale_no, saleNo),
  );
  const dispatchIds = new Set(dispatches.map((dispatch) => dispatch.id));
  const lotRows = allLotRows.filter(
    (lot) => assignedDispatchIds.has(lot.sale_id) || dispatchIds.has(lot.sale_id),
  );

  if (dispatches.length === 0 && lotRows.length === 0) notFound();
  const saleLineResourceId = dispatches[0]?.id ?? lotRows[0]?.sale_id;
  if (!saleLineResourceId) notFound();

  const { data: lines, error: linesError } = lotRows.length > 0
    ? await supabase
        .from("sale_lines")
        .select("lot_id, proceeds, vat_amount, on_guarantee")
        .in("lot_id", lotRows.map((lot) => lot.id))
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (linesError) throw new Error(`Could not load auction sale lines: ${linesError.message}`);

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
  const reprintCount = lotRows.filter((lot) => lot.state === "re-print" || lot.reprint_source_lot_id).length;
  const acknowledgedCount = lotRows.filter((lot) => lot.state !== "invoiced").length;
  const valuedCount = lotCount(lotRows, ["valued", "sold", "settled", "withdrawn", "re-print"]);
  const soldCount = soldLotIds.size;
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
    };
  });

  const reconciliationGroupsByBroker = new Map<string, SalesReconciliationGroup>();
  for (const dispatch of dispatches) {
    const broker = (dispatch.brokers as { name: string } | null)?.name ?? "—";
    const key = dispatch.broker_id ?? broker;
    const current = reconciliationGroupsByBroker.get(key) ?? {
      saleId: dispatch.id,
      broker,
      dispatchNos: [],
      lotCount: 0,
    };
    current.dispatchNos.push(formatFourDigitNo(dispatch.sale_no));
    current.lotCount += (lotsByDispatch.get(dispatch.id) ?? []).length;
    reconciliationGroupsByBroker.set(key, current);
  }
  const reconciliationGroups = [...reconciliationGroupsByBroker.values()].sort((a, b) => a.broker.localeCompare(b.broker));

  const saleLineTableRows = saleLines.rows;

  const [visibleSaleListRows, visibleDispatchTableRows] = await Promise.all([
    applyServerListSearch(supabase, profile, "auction-sales-side-list", saleListRows),
    applyServerListSearch(supabase, profile, "dispatches-in-sale", dispatchTableRows),
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
        <DetailField label="Lots sold" value={`${soldCount}/${lotRows.length}`} />
        <DetailField label="Total proceeds" value={`LKR ${money(totalProceeds)}`} />
        <DetailField label="Total VAT" value={`LKR ${money(totalVat)}`} />
        <DetailField label="Guarantee lots" value={guaranteeLots} />
      </DetailRecordPanel>
      <EntityListTabs
        label="Sale lists"
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
        ]}
      />
    </SaleDetailWorkspace>
  );
}
