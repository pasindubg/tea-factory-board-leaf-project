import { reconcileValuation, validateSaleRevenue } from "@tea/api";
import { requirePageAccess } from "@/lib/profile";
import { applyServerListSearch } from "@/lib/list-search-state";
import { brokerSaleKey, isNotValuedLot, isUnsoldLot, soldBrokerSaleKeys, valuedBrokerSaleKeys } from "../state-buckets";
import { formatFourDigitNo, formatSaleNo, saleNoKey } from "../sale-number";
import { money } from "../format";
import { SalesOverviewTable, type SaleOverviewRow } from "./sales-overview-table";

type LineRow = {
  id: string;
  lot_id: string | null;
  proceeds: number | string | null;
  net_wt: number | string | null;
  price_per_kg: number | string | null;
  vat_amount: number | string | null;
  on_guarantee: boolean | null;
  auction_sales: {
    id: string;
    sale_no: string;
    target_sale_no: string | null;
    dispatch_date: string | null;
    sale_date: string | null;
    prompt_date: string | null;
    broker_id: string | null;
    brokers: { name: string } | null;
  } | null;
};

type AssignmentLot = {
  id: string;
  provisional_sale_no: string | null;
  final_sale_no: string | null;
  net_wt: number | string | null;
  state: string | null;
  shutout: boolean | null;
  unsold: boolean | null;
  skipped_sale: boolean | null;
  skipped_sale_no: string | null;
  auction_sales: LineRow["auction_sales"];
};

type ValuationRow = {
  lot_id: string;
  price_min: number | string | null;
  price_max: number | string | null;
  projected_proceeds: number | string | null;
};
type SettlementRow = {
  sale_id: string;
  net_proceeds: number | string | null;
  total_deductions: number | string | null;
  total_net_proceeds: number | string | null;
  settlement_charges: { code: string; amount: number | string }[] | null;
};
type ContractRow = {
  id: string;
  sale_id: string | null;
  printed_net_proceeds: number | string | null;
  printed_insurance: number | string | null;
  auction_sales: { brokers: { name: string } | null } | null;
};

type DispatchRow = NonNullable<LineRow["auction_sales"]>;

type SaleSummary = {
  saleNo: string;
  saleDate: string | null;
  promptDate: string | null;
  brokers: Set<string>;
  dispatches: Map<string, string>;
  lotsSold: number;
  /** Kg on the SOLD lines only — nil until the auction has happened. */
  netKg: number;
  /** Kg the factory has dispatched into this sale, sold or not. Without it the
   * overview reported a fully-loaded upcoming sale as "0.00". */
  dispatchedKg: number;
  proceeds: number;
  vat: number;
  guaranteeLots: number;
  lots: AssignmentLot[];
  lines: LineRow[];
};

const skippedAway = (lot: AssignmentLot) => Boolean(lot.skipped_sale && lot.skipped_sale_no);

function saleKey(sale: LineRow["auction_sales"], assignment?: AssignmentLot | null) {
  const rawSaleNo = assignment?.final_sale_no || assignment?.provisional_sale_no || sale?.target_sale_no || sale?.sale_no;
  const key = saleNoKey(rawSaleNo);
  return formatSaleNo(key) || "Unassigned";
}

function saleHref(saleNo: string) {
  // The four-digit form, the way the sale is written everywhere else. The
  // route compares prefix-blind (saleNoMatches), so "0019" and "19" both
  // resolve — but only one of them matches what the operator is looking at.
  const key = saleNoKey(saleNo);
  return `/dashboard/auction/sales/${encodeURIComponent(formatSaleNo(key || saleNo) || key || saleNo)}`;
}

export default async function SalesPage() {
  const { supabase, profile } = await requirePageAccess("auction-sales");

  const [
    { data: dispatches }, { data: assignmentLots }, { data: lines },
    { data: valuations }, { data: settlements }, { data: contracts }, { data: rate },
  ] = await Promise.all([
    supabase
      .from("auction_sales")
      .select("id, sale_no, target_sale_no, dispatch_date, sale_date, prompt_date, broker_id, status, brokers(name)")
      .eq("sale_kind", "dispatch")
      .not("target_sale_no", "is", null)
      .order("dispatch_date", { ascending: false }),
    supabase
      .from("auction_lots")
      .select("id, provisional_sale_no, final_sale_no, net_wt, state, shutout, unsold, skipped_sale, skipped_sale_no, auction_sales(id, sale_no, target_sale_no, dispatch_date, sale_date, prompt_date, broker_id, brokers(name))"),
    supabase
      .from("sale_lines")
      .select(
        "id, lot_id, proceeds, net_wt, price_per_kg, vat_amount, on_guarantee, " +
          "auction_sales(id, sale_no, target_sale_no, dispatch_date, sale_date, prompt_date, broker_id, brokers(name))",
      )
      .order("created_at", { ascending: false }),
    supabase.from("valuations").select("lot_id, price_min, price_max, projected_proceeds"),
    supabase.from("settlements").select("sale_id, net_proceeds, total_deductions, total_net_proceeds, settlement_charges(code, amount)"),
    supabase
      .from("doc_imports")
      .select("id, sale_id, printed_net_proceeds, printed_insurance, auction_sales(brokers(name))")
      .eq("doc_type", "contract")
      .eq("status", "confirmed"),
    supabase
      .from("broker_rates")
      .select("charges_vat_pct")
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const rows = (lines ?? []) as unknown as LineRow[];
  const dispatchRows = (dispatches ?? []) as unknown as DispatchRow[];
  const assignmentRows = (assignmentLots ?? []) as unknown as AssignmentLot[];
  const assignmentByLotId = new Map(assignmentRows.map((lot) => [lot.id, lot]));
  const settledDispatchIds = new Set(
    ((dispatches ?? []) as unknown as { id: string; status: string | null }[])
      .filter((dispatch) => dispatch.status === "settled")
      .map((dispatch) => dispatch.id),
  );
  const summaries = new Map<string, SaleSummary>();

  // Dispatch invoices establish an auction sale before individual lots have been
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
      dispatchedKg: 0,
      proceeds: 0,
      vat: 0,
      guaranteeLots: 0,
      lots: [],
      lines: [],
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
      dispatchedKg: 0,
      proceeds: 0,
      vat: 0,
      guaranteeLots: 0,
      lots: [],
      lines: [],
    };

    if (saleKey(dispatch) === key) current.dispatches.set(dispatch.id, formatFourDigitNo(dispatch.sale_no));
    if (dispatch.brokers?.name) current.brokers.add(dispatch.brokers.name);
    current.saleDate ??= dispatch.sale_date;
    current.promptDate ??= dispatch.prompt_date;
    current.lots.push(assignment);
    current.dispatchedKg += Number(assignment.net_wt ?? 0);
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
      dispatchedKg: 0,
      proceeds: 0,
      vat: 0,
      guaranteeLots: 0,
      lots: [],
      lines: [],
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
    current.lines.push(line);
    summaries.set(key, current);
  }

  const valuationRows = (valuations ?? []) as ValuationRow[];
  const settlementRows = (settlements ?? []) as unknown as SettlementRow[];
  const contractRows = (contracts ?? []) as unknown as ContractRow[];
  const assignedSaleNo = (lot: AssignmentLot) =>
    lot.final_sale_no || lot.provisional_sale_no || lot.auction_sales?.target_sale_no || lot.auction_sales?.sale_no || null;
  const soldGroups = soldBrokerSaleKeys(assignmentRows.map((lot) => ({
    state: lot.state,
    brokerId: lot.auction_sales?.broker_id ?? null,
    saleNo: assignedSaleNo(lot),
  })));
  const valuedGroups = valuedBrokerSaleKeys(assignmentRows.map((lot) => ({
    state: lot.state,
    brokerId: lot.auction_sales?.broker_id ?? null,
    saleNo: assignedSaleNo(lot),
  })));

  const saleRows = [...summaries.values()].sort((a, b) => b.saleNo.localeCompare(a.saleNo));
  const totalProceeds = saleRows.reduce((s, r) => s + r.proceeds, 0);
  const totalVat = saleRows.reduce((s, r) => s + r.vat, 0);
  const totalNetKg = saleRows.reduce((s, r) => s + r.netKg, 0);
  const totalLots = saleRows.reduce((s, r) => s + r.lotsSold, 0);
  const tableRows: SaleOverviewRow[] = saleRows.map((s) => {
    const activeLots = s.lots.filter((lot) => !skippedAway(lot));
    const activeLotIds = new Set(activeLots.map((lot) => lot.id));
    const saleValuations = valuationRows.filter((row) => activeLotIds.has(row.lot_id));
    const valuationRecon = reconcileValuation(
      saleValuations.map((row) => {
        const lot = activeLots.find((candidate) => candidate.id === row.lot_id);
        return {
          lotId: row.lot_id,
          invoiceNo: "",
          grade: "",
          netWt: Number(lot?.net_wt ?? 0),
          priceMin: row.price_min == null ? null : Number(row.price_min),
          priceMax: row.price_max == null ? null : Number(row.price_max),
          projectedProceeds: row.projected_proceeds == null ? null : Number(row.projected_proceeds),
        };
      }),
      s.lines.filter((line): line is LineRow & { lot_id: string } => Boolean(line.lot_id)).map((line) => ({ lotId: line.lot_id, pricePerKg: Number(line.price_per_kg ?? 0), proceeds: Number(line.proceeds ?? 0) })),
    );
    const dispatchIds = new Set(s.dispatches.keys());
    const saleSettlements = settlementRows.filter((row) => dispatchIds.has(row.sale_id));
    const totalRevenue = saleSettlements.reduce((sum, row) => sum + Number(row.net_proceeds ?? 0), 0);
    const insuranceBySaleId = new Map<string, number>();
    for (const row of saleSettlements) {
      const insurance = (row.settlement_charges ?? [])
        .filter((charge) => charge.code === "insurance")
        .reduce((sum, charge) => sum + Number(charge.amount ?? 0), 0);
      insuranceBySaleId.set(row.sale_id, (insuranceBySaleId.get(row.sale_id) ?? 0) + insurance);
    }
    const revenueCheck = validateSaleRevenue(
      totalRevenue,
      contractRows.filter((row) => row.sale_id && dispatchIds.has(row.sale_id)).map((row) => ({
        id: row.id,
        brokerName: row.auction_sales?.brokers?.name ?? null,
        printedNetProceeds: row.printed_net_proceeds == null ? null : Number(row.printed_net_proceeds),
        printedInsurance: row.printed_insurance == null ? null : Number(row.printed_insurance),
        computedInsurance: row.sale_id == null ? null : insuranceBySaleId.get(row.sale_id) ?? 0,
      })),
      { chargesVatPct: Number(rate?.charges_vat_pct ?? 0) },
    );
    const groupOf = (lot: AssignmentLot) => brokerSaleKey(lot.auction_sales?.broker_id, assignedSaleNo(lot));
    const soldValuation = valuationRecon.summary.totalProjected;
    const valuedSoldLots = valuationRecon.summary.lots - valuationRecon.summary.noValuation;
    const notValued = s.lots.filter((lot) => isNotValuedLot(lot, valuedGroups.has(groupOf(lot)))).length;
    const shutout = s.lots.filter((lot) => lot.shutout).length;
    const notSold = s.lots.filter((lot) => isUnsoldLot(lot, soldGroups.has(groupOf(lot)))).length;
    const status = [...dispatchIds].some((id) => settledDispatchIds.has(id))
      ? "settled"
      : s.lotsSold > 0
        ? "sold"
        : activeLots.some((lot) => lot.state === "valued" || lot.state === "sold")
          ? "valued"
          : activeLots.some((lot) => lot.state !== "invoiced")
            ? "acknowledged"
            : "draft";
    return {
      saleNo: s.saleNo,
      status,
      href: saleHref(s.saleNo),
      dispatchNos: [...s.dispatches.values()],
      saleDate: s.saleDate,
      brokers: [...s.brokers].sort((a, b) => a.localeCompare(b)),
      totalLots: activeLots.length,
      lotsSold: s.lotsSold,
      netKg: s.netKg,
      dispatchedKg: s.dispatchedKg,
      totalValuation: saleValuations.reduce((sum, row) => sum + Number(row.projected_proceeds ?? 0), 0),
      valuedLots: saleValuations.length,
      soldValuation,
      valuedSoldLots,
      proceeds: s.proceeds,
      averagePerKg: s.netKg === 0 ? null : s.proceeds / s.netKg,
      valuationVariance: valuedSoldLots === 0 ? null : valuationRecon.summary.totalProceeds - soldValuation,
      valuationVariancePct: valuedSoldLots === 0 ? null : valuationRecon.summary.premiumPct,
      totalDeductions: saleSettlements.length === 0 ? null : saleSettlements.reduce((sum, row) => sum + Number(row.total_deductions ?? 0), 0),
      totalRevenue: saleSettlements.length === 0 ? null : totalRevenue,
      revenuePerKg: saleSettlements.length === 0 || s.netKg === 0 ? null : totalRevenue / s.netKg,
      bankCredit: saleSettlements.length === 0 ? null : saleSettlements.reduce((sum, row) => sum + Number(row.total_net_proceeds ?? 0), 0),
      vat: s.vat,
      guaranteeLots: s.guaranteeLots,
      notValued,
      shutout,
      notSold,
      issues: [notValued ? `Not Valued: ${notValued}` : "", shutout ? `Shutout: ${shutout}` : "", notSold ? `Not sold: ${notSold}` : ""].filter(Boolean).join(", ") || null,
      revenueStatus: revenueCheck.status,
      revenueCheck,
    };
  });

  const visibleTableRows = await applyServerListSearch(supabase, profile, "auction-sales-overview", tableRows);

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

      <SalesOverviewTable rows={visibleTableRows} />
    </div>
  );
}
