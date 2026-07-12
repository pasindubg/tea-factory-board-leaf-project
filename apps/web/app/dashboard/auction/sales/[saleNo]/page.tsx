import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModuleAccess } from "@/lib/profile";
import { stateBucket } from "../../state-buckets";
import { formatFourDigitNo, formatSaleNo, saleNoMatches } from "../../sale-number";
import { money } from "../../format";
import { DispatchesInSaleTable, type DispatchInSaleRow } from "./dispatches-in-sale-table";
import { SaleLinesTable, type SaleLineRow } from "./sale-lines-table";
import { SalesSideList, type SaleSideListRow } from "./sales-side-list";
import { SalesReconciliationAssistant, type SalesReconciliationGroup } from "./sales-reconciliation-assistant";

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
  id: string;
  sale_id: string;
  lot_id: string | null;
  proceeds: number | string | null;
  price_per_kg: number | string | null;
  net_wt: number | string | null;
  vat_amount: number | string | null;
  on_guarantee: boolean | null;
  auction_lots: {
    invoice_no: string | null;
    lot_no: string | null;
    grade: string | null;
    bags: number | null;
    kg_per_bag: number | string | null;
    state: string | null;
    reprint_source_lot_id: string | null;
  } | null;
  buyers: { name: string; vat_no: string | null } | null;
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
  const dispatches = allDispatchRows.filter(
    (dispatch) => saleNoMatches(dispatch.target_sale_no, saleNo) || saleNoMatches(dispatch.sale_no, saleNo),
  );

  if (dispatches.length === 0) notFound();

  const dispatchIds = dispatches.map((dispatch) => dispatch.id);
  const [{ data: lots, error: lotsError }, { data: lines, error: linesError }] = await Promise.all([
    supabase
      .from("auction_lots")
      .select("id, sale_id, invoice_no, lot_no, grade, bags, kg_per_bag, sample_allowance, net_wt, state, reprint_source_lot_id, lot_invoices(invoice_no)")
      .in("sale_id", dispatchIds)
      .order("invoice_no"),
    supabase
      .from("sale_lines")
      .select(
        "id, sale_id, lot_id, proceeds, price_per_kg, net_wt, vat_amount, on_guarantee, " +
          "auction_lots(invoice_no, lot_no, grade, bags, kg_per_bag, state, reprint_source_lot_id), " +
          "buyers(name, vat_no)",
      )
      .in("sale_id", dispatchIds)
      .order("created_at", { ascending: false }),
  ]);
  if (lotsError) throw new Error(`Could not load auction sale lots: ${lotsError.message}`);
  if (linesError) throw new Error(`Could not load auction sale lines: ${linesError.message}`);

  const lotRows = (lots ?? []) as unknown as LotRow[];
  const lineRows = (lines ?? []) as unknown as LineRow[];
  const lotIds = lotRows.map((lot) => lot.id).filter(Boolean);
  const reprintCountBySource = new Map<string, number>();
  if (lotIds.length > 0) {
    const { data: reprintChildren, error: reprintError } = await supabase
      .from("auction_lots")
      .select("reprint_source_lot_id")
      .in("reprint_source_lot_id", lotIds);
    if (reprintError) throw new Error(`Could not load re-print counts: ${reprintError.message}`);
    for (const child of (reprintChildren ?? []) as { reprint_source_lot_id: string | null }[]) {
      if (!child.reprint_source_lot_id) continue;
      reprintCountBySource.set(child.reprint_source_lot_id, (reprintCountBySource.get(child.reprint_source_lot_id) ?? 0) + 1);
    }
  }
  const dispatchById = new Map(dispatches.map((dispatch) => [dispatch.id, dispatch]));
  const saleLineByLotId = new Map(lineRows.filter((line) => line.lot_id).map((line) => [line.lot_id as string, line]));
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
  const totalNetKg = lineRows.reduce((s, line) => s + Number(line.net_wt ?? 0), 0);
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
      detail: settledCount > 0 ? plural(settledCount, "dispatch", "dispatches") : "Pending",
    },
  ];
  const currentStepIndex = Math.max(
    0,
    machineSteps.reduce((furthest, step, index) => (step.count > 0 ? index : furthest), -1),
  );
  const issueSteps = [
    { label: "Pending", count: lotCount(lotRows, ["pending"]) },
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
  for (const dispatch of allDispatchRows) {
    const key = formatSaleNo(dispatch.target_sale_no || dispatch.sale_no);
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

  const saleLineTableRows: SaleLineRow[] = lotRows.map((lot) => {
    const line = saleLineByLotId.get(lot.id);
    const dispatch = dispatchById.get(lot.sale_id);
    const invoices = (lot.lot_invoices ?? []).map((invoice) => formatFourDigitNo(invoice.invoice_no)).filter(Boolean);
    const state = stateBucket(lot.state);
    return {
      id: lot.id,
      saleId: lot.sale_id,
      dispatchId: dispatch?.id ?? null,
      dispatchSaleNo: dispatch ? formatFourDigitNo(dispatch.sale_no) : null,
      lotNo: formatFourDigitNo(lot.lot_no),
      invoiceNo: invoices.length > 0 ? invoices.join(", ") : formatFourDigitNo(lot.invoice_no),
      grade: lot.grade ?? null,
      state: lot.state ?? null,
      stateLabel: state.label,
      stateStyle: state.style,
      buyerName: line?.buyers?.name ?? null,
      buyerVatNo: line?.buyers?.vat_no ?? null,
      bags: lot.bags ?? null,
      kgPerBag: lot.kg_per_bag != null ? Number(lot.kg_per_bag) : null,
      sampleKg: lot.sample_allowance != null ? Number(lot.sample_allowance) : null,
      netWt: Number(line?.net_wt ?? lot.net_wt ?? 0),
      pricePerKg: line?.price_per_kg != null ? Number(line.price_per_kg) : null,
      proceeds: line?.proceeds != null ? Number(line.proceeds) : null,
      vatAmount: line?.vat_amount != null ? Number(line.vat_amount) : null,
      onGuarantee: line?.on_guarantee == null ? null : Boolean(line.on_guarantee),
      reprint: Boolean(lot.reprint_source_lot_id),
      reprintCount: reprintCountBySource.get(lot.id) ?? 0,
    };
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[17rem_minmax(0,1fr)]">
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
              {dispatches.length} dispatch{dispatches.length === 1 ? "" : "es"} · {lotRows.length} lots · {soldCount} sold · {reprintCount} re-print
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

      <section>
        <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-300">Lots and invoices in this sale</h3>
        <SaleLinesTable rows={saleLineTableRows} invoiceEditingLocked={invoiceEditingLocked} />
      </section>

      <section>
        <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-300">Dispatches in this sale</h3>
        <DispatchesInSaleTable rows={dispatchTableRows} />
      </section>
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
