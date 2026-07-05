import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModuleAccess } from "@/lib/profile";
import { stateBucket } from "../../state-buckets";
import { formatFourDigitNo, formatSaleNo, saleNoMatches } from "../../sale-number";
import { money } from "../../format";
import { DispatchesInSaleTable, type DispatchInSaleRow } from "./dispatches-in-sale-table";
import { SaleLinesTable, type SaleLineRow } from "./sale-lines-table";

type DispatchRow = {
  id: string;
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
  state: string | null;
  reprint_source_lot_id: string | null;
};

type LineRow = {
  id: string;
  sale_id: string;
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
    .select("id, sale_no, target_sale_no, dispatch_date, sale_date, prompt_date, status, brokers(name)")
    .order("dispatch_date", { ascending: false });
  if (dispatchesError) throw new Error(`Could not load auction sale dispatches: ${dispatchesError.message}`);

  const dispatches = ((allDispatches ?? []) as unknown as DispatchRow[]).filter(
    (dispatch) => saleNoMatches(dispatch.target_sale_no, saleNo) || saleNoMatches(dispatch.sale_no, saleNo),
  );

  if (dispatches.length === 0) notFound();

  const dispatchIds = dispatches.map((dispatch) => dispatch.id);
  const [{ data: lots, error: lotsError }, { data: lines, error: linesError }] = await Promise.all([
    supabase
      .from("auction_lots")
      .select("id, sale_id, invoice_no, lot_no, grade, state, reprint_source_lot_id")
      .in("sale_id", dispatchIds)
      .order("invoice_no"),
    supabase
      .from("sale_lines")
      .select(
        "id, sale_id, proceeds, price_per_kg, net_wt, vat_amount, on_guarantee, " +
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
  const dispatchById = new Map(dispatches.map((dispatch) => [dispatch.id, dispatch]));
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
  const soldCount = lineRows.length;
  const settledCount = dispatchCount(dispatches, ["settled"]);
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
      soldLots: lineRows.filter((line) => line.sale_id === dispatch.id).length,
      reprintLots: dispatchLots.filter((lot) => lot.state === "re-print" || lot.reprint_source_lot_id).length,
      statusLabel: state.label,
      statusStyle: state.style,
    };
  });

  const saleLineTableRows: SaleLineRow[] = lineRows.map((line) => {
    const lot = line.auction_lots;
    const dispatch = dispatchById.get(line.sale_id);
    return {
      id: line.id,
      dispatchId: dispatch?.id ?? null,
      dispatchSaleNo: dispatch ? formatFourDigitNo(dispatch.sale_no) : null,
      lotNo: lot?.lot_no ?? null,
      invoiceNo: lot?.invoice_no ?? null,
      grade: lot?.grade ?? null,
      buyerName: line.buyers?.name ?? null,
      buyerVatNo: line.buyers?.vat_no ?? null,
      bags: lot?.bags ?? null,
      kgPerBag: lot?.kg_per_bag != null ? Number(lot.kg_per_bag) : null,
      netWt: Number(line.net_wt ?? 0),
      pricePerKg: Number(line.price_per_kg ?? 0),
      proceeds: Number(line.proceeds ?? 0),
      vatAmount: Number(line.vat_amount ?? 0),
      onGuarantee: Boolean(line.on_guarantee),
      reprint: Boolean(lot?.reprint_source_lot_id),
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/auction/sales" className="text-sm text-green-700 hover:underline dark:text-green-400">
          ← Sales Overview
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-5">
          <div>
            <h2 className="text-xl font-semibold">Sale {displaySaleNo}</h2>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {dispatches.length} dispatch{dispatches.length === 1 ? "" : "es"} · {lineRows.length} lots sold · {reprintCount} re-print
            </p>
          </div>
          <div className="w-full max-w-3xl">
            <ol className="grid grid-cols-5 gap-1.5">
              {machineSteps.map((step, index) => (
                <li
                  key={step.label}
                  className={`min-h-16 rounded-lg border px-2.5 py-2 ${stepClass(index, currentStepIndex)}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide">{index + 1}</span>
                    <span className={`h-2 w-2 rounded-full ${index <= currentStepIndex ? "bg-current" : "bg-stone-300 dark:bg-stone-600"}`} />
                  </div>
                  <p className="mt-2 truncate text-xs font-semibold">{step.label}</p>
                  <p className="mt-0.5 truncate text-[11px] opacity-75">{step.detail}</p>
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
        <Summary label="Lots sold" value={lineRows.length.toString()} />
        <Summary label="Total proceeds" value={`LKR ${money(totalProceeds)}`} />
        <Summary label="Total VAT" value={`LKR ${money(totalVat)}`} accent="blue" />
        <Summary label="Guarantee lots" value={guaranteeLots.toString()} />
      </div>

      <section>
        <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-300">Dispatches in this sale</h3>
        <DispatchesInSaleTable rows={dispatchTableRows} />
      </section>

      <section>
        <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-300">Sales done on this sale</h3>
        <SaleLinesTable rows={saleLineTableRows} />
      </section>
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
