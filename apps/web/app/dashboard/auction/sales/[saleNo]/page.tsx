import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModuleAccess } from "@/lib/profile";
import { loadListResource } from "@/lib/list-resource-registry";
import { stateBucket } from "../../state-buckets";
import { formatFourDigitNo, formatSaleNo, saleNoKey, saleNoMatches } from "../../sale-number";
import { money } from "../../format";
import { DispatchesInSaleTable, type DispatchInSaleRow } from "./dispatches-in-sale-table";
import { SaleLinesTable } from "./sale-lines-table";
import { SalesSideList, type SaleSideListRow } from "./sales-side-list";
import { SalesReconciliationAssistant, type SalesReconciliationGroup } from "./sales-reconciliation-assistant";
import { EntityListTabs } from "@/components/entity-list";

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

type MachineStep = {
  label: string;
  count: number;
  detail: string;
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

function stepClass(index: number, currentIndex: number) {
  if (index < currentIndex) {
    return "border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200";
  }
  if (index === currentIndex) {
    return "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200";
  }
  return "border-stone-200 bg-white text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400";
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
  const { supabase } = await requireModuleAccess("auction");
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
  const machineSteps: MachineStep[] = [
    {
      label: "Draft",
      count: dispatches.length,
      detail: plural(lotRows.length, "lot"),
    },
    {
      label: "Acknowledged",
      count: acknowledgedCount,
      detail: `${acknowledgedCount}/${lotRows.length} lots`,
    },
    {
      label: "Valued",
      count: valuedCount,
      detail: `${valuedCount}/${lotRows.length} lots`,
    },
    {
      label: "Sold",
      count: soldCount,
      detail: plural(soldCount, "lot"),
    },
    {
      label: "Settled",
      count: settledCount,
      detail: settledCount > 0 ? plural(settledCount, "broker invoice", "broker invoices") : "Pending",
    },
  ];
  const currentStepIndex = Math.max(
    0,
    machineSteps.reduce((furthest, step, index) => (step.count > 0 ? index : furthest), -1),
  );
  const issueSteps = [
    { label: "Pending", count: lotCount(lotRows, ["pending"]) },
    { label: "Not Valued", count: lotCount(lotRows, ["not-valued"]) },
    { label: "Shutout", count: lotCount(lotRows, ["shutout"]) },
    { label: "Withdrawn", count: lotCount(lotRows, ["withdrawn"]) },
    { label: "Re-print", count: lotRows.filter((lot) => lot.state === "re-print" || lot.reprint_source_lot_id).length },
    { label: "Missing", count: lotCount(lotRows, ["missing"]) },
  ].filter((item) => item.count > 0);
  const saleListSummaries = new Map<string, {
    saleNo: string;
    dispatchNos: Map<string, string>;
    brokers: Set<string>;
    saleDate: string | null;
    statuses: Set<string>;
  }>();
  const allDispatchById = new Map(allDispatchRows.map((dispatch) => [dispatch.id, dispatch]));
  for (const dispatch of allDispatchRows) {
    const key = formatSaleNo(saleNoKey(dispatch.target_sale_no || dispatch.sale_no));
    if (!key) continue;
    const current = saleListSummaries.get(key) ?? {
      saleNo: key,
      dispatchNos: new Map<string, string>(),
      brokers: new Set<string>(),
      saleDate: dispatch.sale_date,
      statuses: new Set<string>(),
    };
    current.dispatchNos.set(dispatch.id, formatFourDigitNo(dispatch.sale_no));
    if (dispatch.brokers?.name) current.brokers.add(dispatch.brokers.name);
    current.saleDate ??= dispatch.sale_date;
    current.statuses.add(stateBucket(dispatch.status).label);
    saleListSummaries.set(key, current);
  }
  for (const lot of allLotRows) {
    const dispatch = allDispatchById.get(lot.sale_id);
    if (!dispatch) continue;
    const key = formatSaleNo(saleNoKey(lot.final_sale_no || lot.provisional_sale_no));
    if (!key) continue;
    const current = saleListSummaries.get(key) ?? {
      saleNo: key,
      dispatchNos: new Map<string, string>(),
      brokers: new Set<string>(),
      saleDate: dispatch.sale_date,
      statuses: new Set<string>(),
    };
    current.dispatchNos.set(dispatch.id, formatFourDigitNo(dispatch.sale_no));
    if (dispatch.brokers?.name) current.brokers.add(dispatch.brokers.name);
    current.saleDate ??= dispatch.sale_date;
    current.statuses.add(stateBucket(dispatch.status).label);
    saleListSummaries.set(key, current);
  }
  const saleListRows: SaleSideListRow[] = [...saleListSummaries.values()]
    .sort((a, b) => b.saleNo.localeCompare(a.saleNo, undefined, { numeric: true }))
    .map((sale) => ({
      saleNo: sale.saleNo,
      dispatchNos: [...sale.dispatchNos.values()],
      brokers: [...sale.brokers].sort((a, b) => a.localeCompare(b)),
      saleDate: sale.saleDate,
      statuses: [...sale.statuses].sort((a, b) => a.localeCompare(b)),
    }));

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

  return (
    <div className="grid min-h-[calc(100dvh-8rem)] w-full items-start gap-6 xl:grid-cols-[clamp(13rem,18vw,20rem)_minmax(0,1fr)]">
      <SalesSideList rows={saleListRows} currentSaleNo={displaySaleNo} />
      <div className="min-w-0 space-y-6">
      <div>
        <Link href="/dashboard/auction/sales" className="text-sm text-green-700 hover:underline dark:text-green-400">
          ← Sales Overview
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-5">
          <div>
            <h2 className="text-xl font-semibold">Sale {displaySaleNo}</h2>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {dispatches.length} broker invoice{dispatches.length === 1 ? "" : "s"} · {lotRows.length} lots · {soldCount} sold · {reprintCount} re-print
            </p>
          </div>
          <div className="w-full max-w-xl lg:ml-auto lg:w-[34rem]">
            <ol className="grid grid-cols-5 gap-1.5">
              {machineSteps.map((step, index) => (
                <li
                  key={step.label}
                  className={`min-h-12 rounded-lg border px-2 py-1.5 ${stepClass(index, currentStepIndex)}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[10px] font-medium opacity-75">{step.detail}</span>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${index <= currentStepIndex ? "bg-current" : "bg-stone-300 dark:bg-stone-600"}`} />
                  </div>
                  <p className="mt-1 truncate text-[11px] font-semibold">{step.label}</p>
                </li>
              ))}
            </ol>
            {issueSteps.length > 0 && (
              <div className="mt-2 flex flex-wrap justify-end gap-2">
                {issueSteps.map((item) => (
                  <span
                    key={item.label}
                    className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  >
                    {item.label}: {item.count}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Summary label="Lots sold" value={`${soldCount}/${lotRows.length}`} />
        <Summary label="Total proceeds" value={`LKR ${money(totalProceeds)}`} />
        <Summary label="Total VAT" value={`LKR ${money(totalVat)}`} accent="blue" />
        <Summary label="Guarantee lots" value={guaranteeLots.toString()} />
      </div>

      <section>
        <SalesReconciliationAssistant saleNo={displaySaleNo} groups={reconciliationGroups} />
      </section>

      <EntityListTabs
        label="Sale lists"
        tabs={[
          { id: "lots", label: "Lots & invoices", count: `${saleLineTableRows.length} lots`, content: <SaleLinesTable saleId={saleLineResourceId} rows={saleLineTableRows} invoiceEditingLocked={invoiceEditingLocked} /> },
          { id: "dispatches", label: "Broker invoices", count: `${dispatchTableRows.length} broker invoices`, content: <DispatchesInSaleTable rows={dispatchTableRows} /> },
        ]}
      />
      </div>
    </div>
  );
}

function Summary({ label, value, accent }: { label: string; value: string; accent?: "blue" }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
      <p className="text-xs text-stone-500 dark:text-stone-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accent === "blue" ? "text-blue-800 dark:text-blue-400" : "text-stone-800 dark:text-stone-200"}`}>
        {value}
      </p>
    </div>
  );
}
