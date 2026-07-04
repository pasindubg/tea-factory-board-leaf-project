import { requireModuleAccess } from "@/lib/profile";
import { saleNoKey } from "../sale-number";
import { money } from "../format";
import { SalesOverviewTable, type SaleOverviewRow } from "./sales-overview-table";

type LineRow = {
  id: string;
  proceeds: number | string | null;
  net_wt: number | string | null;
  vat_amount: number | string | null;
  on_guarantee: boolean | null;
  auction_sales: {
    id: string;
    sale_no: string;
    target_sale_no: string | null;
    dispatch_date: string | null;
    sale_date: string | null;
    prompt_date: string | null;
    brokers: { name: string } | null;
  } | null;
};

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

type SaleSummary = {
  saleNo: string;
  saleDate: string | null;
  promptDate: string | null;
  broker: string;
  dispatches: Map<string, string>;
  lotsSold: number;
  netKg: number;
  proceeds: number;
  vat: number;
  guaranteeLots: number;
};

function saleKey(sale: LineRow["auction_sales"]) {
  return sale?.target_sale_no || sale?.sale_no || "Unassigned";
}

function dispatchKey(dispatch: DispatchRow) {
  return dispatch.target_sale_no || dispatch.sale_no;
}

function saleHref(saleNo: string) {
  const key = saleNoKey(saleNo);
  return `/dashboard/auction/sales/${encodeURIComponent(key || saleNo)}`;
}

export default async function SalesPage() {
  const { supabase } = await requireModuleAccess("auction");

  const [{ data: dispatches }, { data: lines }] = await Promise.all([
    supabase
      .from("auction_sales")
      .select("id, sale_no, target_sale_no, dispatch_date, sale_date, prompt_date, status, brokers(name)")
      .not("target_sale_no", "is", null)
      .order("dispatch_date", { ascending: false }),
    supabase
      .from("sale_lines")
      .select(
        "id, proceeds, net_wt, vat_amount, on_guarantee, " +
          "auction_sales(id, sale_no, target_sale_no, dispatch_date, sale_date, prompt_date, brokers(name))",
      )
      .order("created_at", { ascending: false }),
  ]);

  const rows = (lines ?? []) as unknown as LineRow[];
  const dispatchRows = (dispatches ?? []) as unknown as DispatchRow[];
  const summaries = new Map<string, SaleSummary>();

  for (const dispatch of dispatchRows) {
    const key = dispatchKey(dispatch);
    const current = summaries.get(key) ?? {
      saleNo: key,
      saleDate: dispatch.sale_date,
      promptDate: dispatch.prompt_date,
      broker: dispatch.brokers?.name ?? "—",
      dispatches: new Map<string, string>(),
      lotsSold: 0,
      netKg: 0,
      proceeds: 0,
      vat: 0,
      guaranteeLots: 0,
    };

    current.dispatches.set(dispatch.id, dispatch.sale_no);
    current.saleDate ??= dispatch.sale_date;
    current.promptDate ??= dispatch.prompt_date;
    if (current.broker === "—" && dispatch.brokers?.name) current.broker = dispatch.brokers.name;
    summaries.set(key, current);
  }

  for (const line of rows) {
    const sale = line.auction_sales;
    const key = saleKey(sale);
    const current = summaries.get(key) ?? {
      saleNo: key,
      saleDate: sale?.sale_date ?? null,
      promptDate: sale?.prompt_date ?? null,
      broker: sale?.brokers?.name ?? "—",
      dispatches: new Map<string, string>(),
      lotsSold: 0,
      netKg: 0,
      proceeds: 0,
      vat: 0,
      guaranteeLots: 0,
    };

    if (sale?.id) current.dispatches.set(sale.id, sale.sale_no);
    current.saleDate ??= sale?.sale_date ?? null;
    current.promptDate ??= sale?.prompt_date ?? null;
    if (current.broker === "—" && sale?.brokers?.name) current.broker = sale.brokers.name;
    current.lotsSold += 1;
    current.netKg += Number(line.net_wt ?? 0);
    current.proceeds += Number(line.proceeds ?? 0);
    current.vat += Number(line.vat_amount ?? 0);
    if (line.on_guarantee) current.guaranteeLots += 1;
    summaries.set(key, current);
  }

  const saleRows = [...summaries.values()].sort((a, b) => b.saleNo.localeCompare(a.saleNo));
  const totalProceeds = saleRows.reduce((s, r) => s + r.proceeds, 0);
  const totalVat = saleRows.reduce((s, r) => s + r.vat, 0);
  const totalNetKg = saleRows.reduce((s, r) => s + r.netKg, 0);
  const totalLots = saleRows.reduce((s, r) => s + r.lotsSold, 0);
  const tableRows: SaleOverviewRow[] = saleRows.map((s) => ({
    saleNo: s.saleNo,
    href: saleHref(s.saleNo),
    dispatchNos: [...s.dispatches.values()],
    saleDate: s.saleDate,
    broker: s.broker,
    lotsSold: s.lotsSold,
    netKg: s.netKg,
    proceeds: s.proceeds,
    vat: s.vat,
    guaranteeLots: s.guaranteeLots,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
          <p className="text-xs text-stone-500 dark:text-stone-400">Auction sales</p>
          <p className="mt-1 text-2xl font-semibold text-green-800 dark:text-green-400">{saleRows.length}</p>
          <p className="text-xs text-stone-400 dark:text-stone-500">{totalLots} lots sold</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
          <p className="text-xs text-stone-500 dark:text-stone-400">Total proceeds</p>
          <p className="mt-1 text-2xl font-semibold text-stone-800 dark:text-stone-200">LKR {money(totalProceeds)}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
          <p className="text-xs text-stone-500 dark:text-stone-400">Total VAT</p>
          <p className="mt-1 text-2xl font-semibold text-blue-800 dark:text-blue-400">LKR {money(totalVat)}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
          <p className="text-xs text-stone-500 dark:text-stone-400">Net kg sold</p>
          <p className="mt-1 text-2xl font-semibold text-stone-800 dark:text-stone-200">{money(totalNetKg)}</p>
        </div>
      </div>

      <SalesOverviewTable rows={tableRows} />
    </div>
  );
}
