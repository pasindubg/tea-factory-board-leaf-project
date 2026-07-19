import { requirePageAccess } from "@/lib/profile";
import { formatFourDigitNo, formatSaleNo, saleNoKey } from "../sale-number";
import { money } from "../format";
import { SalesOverviewTable, type SaleOverviewRow } from "./sales-overview-table";

type LineRow = {
  id: string;
  lot_id: string | null;
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

type AssignmentLot = {
  id: string;
  provisional_sale_no: string | null;
  final_sale_no: string | null;
  auction_sales: LineRow["auction_sales"];
};

type DispatchRow = NonNullable<LineRow["auction_sales"]>;

type SaleSummary = {
  saleNo: string;
  saleDate: string | null;
  promptDate: string | null;
  brokers: Set<string>;
  dispatches: Map<string, string>;
  lotsSold: number;
  netKg: number;
  proceeds: number;
  vat: number;
  guaranteeLots: number;
};

function saleKey(sale: LineRow["auction_sales"], assignment?: AssignmentLot | null) {
  const rawSaleNo = assignment?.final_sale_no || assignment?.provisional_sale_no || sale?.target_sale_no || sale?.sale_no;
  const key = saleNoKey(rawSaleNo);
  return formatSaleNo(key) || "Unassigned";
}

function saleHref(saleNo: string) {
  const key = saleNoKey(saleNo);
  return `/dashboard/auction/sales/${encodeURIComponent(key || saleNo)}`;
}

export default async function SalesPage() {
  const { supabase } = await requirePageAccess("auction-sales");

  const [{ data: dispatches }, { data: assignmentLots }, { data: lines }] = await Promise.all([
    supabase
      .from("auction_sales")
      .select("id, sale_no, target_sale_no, dispatch_date, sale_date, prompt_date, brokers(name)")
      .eq("sale_kind", "dispatch")
      .not("target_sale_no", "is", null)
      .order("dispatch_date", { ascending: false }),
    supabase
      .from("auction_lots")
      .select("id, provisional_sale_no, final_sale_no, auction_sales(id, sale_no, target_sale_no, dispatch_date, sale_date, prompt_date, brokers(name))"),
    supabase
      .from("sale_lines")
      .select(
        "id, lot_id, proceeds, net_wt, vat_amount, on_guarantee, " +
          "auction_sales(id, sale_no, target_sale_no, dispatch_date, sale_date, prompt_date, brokers(name))",
      )
      .order("created_at", { ascending: false }),
  ]);

  const rows = (lines ?? []) as unknown as LineRow[];
  const dispatchRows = (dispatches ?? []) as unknown as DispatchRow[];
  const assignmentRows = (assignmentLots ?? []) as unknown as AssignmentLot[];
  const assignmentByLotId = new Map(assignmentRows.map((lot) => [lot.id, lot]));
  const summaries = new Map<string, SaleSummary>();

  // Broker invoices establish an auction sale before individual lots have been
  // reconciled and assigned. Include them first, then enrich the same sale with
  // assignment and sale-line information below.
  for (const dispatch of dispatchRows) {
    const key = saleKey(dispatch);
    const current = summaries.get(key) ?? {
      saleNo: key,
      saleDate: dispatch.sale_date,
      promptDate: dispatch.prompt_date,
      brokers: new Set<string>(),
      dispatches: new Map<string, string>(),
      lotsSold: 0,
      netKg: 0,
      proceeds: 0,
      vat: 0,
      guaranteeLots: 0,
    };

    current.dispatches.set(dispatch.id, formatFourDigitNo(dispatch.sale_no));
    if (dispatch.brokers?.name) current.brokers.add(dispatch.brokers.name);
    current.saleDate ??= dispatch.sale_date;
    current.promptDate ??= dispatch.prompt_date;
    summaries.set(key, current);
  }

  for (const assignment of assignmentRows) {
    const dispatch = assignment.auction_sales;
    if (!dispatch) continue;
    const key = saleKey(dispatch, assignment);
    const current = summaries.get(key) ?? {
      saleNo: key,
      saleDate: dispatch.sale_date,
      promptDate: dispatch.prompt_date,
      brokers: new Set<string>(),
      dispatches: new Map<string, string>(),
      lotsSold: 0,
      netKg: 0,
      proceeds: 0,
      vat: 0,
      guaranteeLots: 0,
    };

    current.dispatches.set(dispatch.id, formatFourDigitNo(dispatch.sale_no));
    if (dispatch.brokers?.name) current.brokers.add(dispatch.brokers.name);
    current.saleDate ??= dispatch.sale_date;
    current.promptDate ??= dispatch.prompt_date;
    summaries.set(key, current);
  }

  for (const line of rows) {
    const sale = line.auction_sales;
    const assignment = line.lot_id ? assignmentByLotId.get(line.lot_id) : null;
    const key = saleKey(sale, assignment);
    const current = summaries.get(key) ?? {
      saleNo: key,
      saleDate: sale?.sale_date ?? null,
      promptDate: sale?.prompt_date ?? null,
      brokers: new Set<string>(),
      dispatches: new Map<string, string>(),
      lotsSold: 0,
      netKg: 0,
      proceeds: 0,
      vat: 0,
      guaranteeLots: 0,
    };

    if (sale?.id) current.dispatches.set(sale.id, formatFourDigitNo(sale.sale_no));
    if (sale?.brokers?.name) current.brokers.add(sale.brokers.name);
    current.saleDate ??= sale?.sale_date ?? null;
    current.promptDate ??= sale?.prompt_date ?? null;
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
    brokers: [...s.brokers].sort((a, b) => a.localeCompare(b)),
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
