import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModuleAccess } from "@/lib/profile";
import { stateBucket } from "../../state-buckets";
import { saleNoMatches } from "../../sale-number";
import { money } from "../../format";

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

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/auction/sales" className="text-sm text-green-700 hover:underline dark:text-green-400">
          ← Sales Overview
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-5">
          <div>
            <h2 className="text-xl font-semibold">Sale {saleNo}</h2>
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
        <div className="mt-3 overflow-x-auto rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
                <th className="px-4 py-3">Dispatch no.</th>
                <th className="px-4 py-3">Broker</th>
                <th className="px-4 py-3">Dispatched</th>
                <th className="px-4 py-3">Sale date</th>
                <th className="px-4 py-3 text-right">Lots</th>
                <th className="px-4 py-3">Lot statuses</th>
                <th className="px-4 py-3 text-right">Sold</th>
                <th className="px-4 py-3 text-right">Re-print</th>
                <th className="px-4 py-3">Dispatch status</th>
              </tr>
            </thead>
            <tbody>
              {dispatches.map((dispatch) => {
                const state = stateBucket(dispatch.status);
                const dispatchLots = lotsByDispatch.get(dispatch.id) ?? [];
                const soldLots = lineRows.filter((line) => line.sale_id === dispatch.id).length;
                const reprintLots = dispatchLots.filter((lot) => lot.state === "re-print" || lot.reprint_source_lot_id).length;
                return (
                  <tr key={dispatch.id} className="border-b border-stone-100 last:border-0 dark:border-stone-800">
                    <td className="px-4 py-2 font-medium">
                      <Link href={`/dashboard/auction/${dispatch.id}`} className="text-green-700 hover:underline dark:text-green-400">
                        {dispatch.sale_no}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{(dispatch.brokers as { name: string } | null)?.name ?? "—"}</td>
                    <td className="px-4 py-2 text-stone-600 dark:text-stone-400">{dispatch.dispatch_date ?? "—"}</td>
                    <td className="px-4 py-2 text-stone-600 dark:text-stone-400">{dispatch.sale_date ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{dispatchLots.length}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        {statusBreakdown(dispatchLots).map((item) => (
                          <span key={item.label} className={`rounded-full px-2 py-0.5 text-xs ${item.style}`}>
                            {item.label}: {item.count}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{soldLots}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{reprintLots}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${state.style}`}>{state.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-300">Sales done on this sale</h3>
        <div className="mt-3 overflow-x-auto rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
                <th className="px-4 py-3">Dispatch no.</th>
                <th className="px-4 py-3">Lot no.</th>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Grade</th>
                <th className="px-4 py-3">Buyer</th>
                <th className="px-4 py-3 text-right">Bags</th>
                <th className="px-4 py-3 text-right">kg/bag</th>
                <th className="px-4 py-3 text-right">Net kg</th>
                <th className="px-4 py-3 text-right">Price/kg</th>
                <th className="px-4 py-3 text-right">Proceeds</th>
                <th className="px-4 py-3 text-right">VAT</th>
                <th className="px-4 py-3">Guarantee</th>
                <th className="px-4 py-3">Re-print</th>
              </tr>
            </thead>
            <tbody>
              {lineRows.map((line) => {
                const lot = line.auction_lots;
                const buyer = line.buyers;
                const dispatch = dispatchById.get(line.sale_id);
                return (
                  <tr key={line.id} className="border-b border-stone-100 last:border-0 dark:border-stone-800">
                    <td className="px-4 py-2">
                      {dispatch ? (
                        <Link href={`/dashboard/auction/${dispatch.id}`} className="text-green-700 hover:underline dark:text-green-400">
                          {dispatch.sale_no}
                        </Link>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-2">{lot?.lot_no ?? "—"}</td>
                    <td className="px-4 py-2 font-medium">{lot?.invoice_no ?? "—"}</td>
                    <td className="px-4 py-2">{lot?.grade ?? "—"}</td>
                    <td className="px-4 py-2">
                      {buyer?.name ?? "—"}
                      {buyer?.vat_no && <span className="ml-1 text-xs text-stone-400 dark:text-stone-500">{buyer.vat_no}</span>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{lot?.bags ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{lot?.kg_per_bag != null ? Number(lot.kg_per_bag).toFixed(2) : "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{Number(line.net_wt ?? 0).toFixed(2)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{Number(line.price_per_kg ?? 0).toFixed(2)}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">{money(Number(line.proceeds ?? 0))}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(Number(line.vat_amount ?? 0))}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${line.on_guarantee ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-400" : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400"}`}>
                        {line.on_guarantee ? "Guarantee" : "Cash"}
                      </span>
                    </td>
                    <td className="px-4 py-2">{lot?.reprint_source_lot_id ? "Yes" : "No"}</td>
                  </tr>
                );
              })}
              {lineRows.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">
                    No sold lots have been confirmed for this sale yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
