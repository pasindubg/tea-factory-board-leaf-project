import Link from "next/link";
import { requireModuleAccess } from "@/lib/profile";
import { BySaleTable, type BySaleRow } from "./by-sale-table";
import { formatFourDigitNo, formatSaleNo } from "../sale-number";

// Cross-sale auction dashboard — highlights + details across ALL lots and sales.
// Reads the committed domain tables (lots, sale_lines, valuations, settlements,
// bank_txns) and aggregates in-process. Light + dark themed like the rest of the
// auction module.

const LKR = (n: number) =>
  "Rs " + n.toLocaleString("en-LK", { maximumFractionDigits: 0 });
const KG = (n: number) => n.toLocaleString("en-LK", { maximumFractionDigits: 2 }) + " kg";

// Lifecycle states in display order, with the swatch used in the by-state bar.
const STATE_ORDER: { key: string; label: string; bar: string; chip: string }[] = [
  { key: "invoiced", label: "Invoiced", bar: "bg-stone-400 dark:bg-stone-500", chip: "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300" },
  { key: "dispatched", label: "Invoiced", bar: "bg-stone-400 dark:bg-stone-500", chip: "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300" },
  { key: "pending", label: "Pending", bar: "bg-sky-500", chip: "bg-sky-100 dark:bg-sky-900 text-sky-800 dark:text-sky-300" },
  { key: "acknowledged", label: "Acknowledged", bar: "bg-blue-500", chip: "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300" },
  { key: "catalogued", label: "Acknowledged", bar: "bg-blue-500", chip: "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300" },
  { key: "valued", label: "Valued", bar: "bg-amber-500", chip: "bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300" },
  { key: "sold", label: "Sold", bar: "bg-green-600", chip: "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300" },
  { key: "re-print", label: "Re-print", bar: "bg-orange-500", chip: "bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-300" },
  { key: "shutout", label: "Shutout", bar: "bg-red-500", chip: "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300" },
  { key: "withdrawn", label: "Withdrawn", bar: "bg-stone-300 dark:bg-stone-600", chip: "bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400" },
  { key: "settled", label: "Settled", bar: "bg-emerald-600", chip: "bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-300" },
];

export default async function AuctionDashboardPage() {
  const { supabase } = await requireModuleAccess("auction");

  const [{ data: lots }, { data: sales }, { data: lines }, { data: vals }, { data: settlements }, { data: bank }] =
    await Promise.all([
      supabase.from("auction_lots").select("id, sale_id, state, net_wt, grade"),
      supabase.from("auction_sales").select("id, sale_no, target_sale_no, status, sale_date, prompt_date, brokers(name)").eq("sale_kind", "dispatch").order("sale_date", { ascending: false }),
      supabase.from("sale_lines").select("sale_id, lot_id, proceeds, vat_amount, on_guarantee, net_wt"),
      supabase.from("valuations").select("lot_id, projected_proceeds"),
      supabase.from("settlements").select("sale_id, total_net_proceeds, prompt_date"),
      supabase.from("bank_txns").select("credit, match_status, matched_settlement_id"),
    ]);

  const allLots = lots ?? [];
  const allLines = lines ?? [];
  const allSales = sales ?? [];

  // ── Lots by state ──
  const byState = new Map<string, { count: number; kg: number }>();
  for (const l of allLots) {
    const e = byState.get(l.state) ?? { count: 0, kg: 0 };
    e.count += 1;
    e.kg += Number(l.net_wt ?? 0);
    byState.set(l.state, e);
  }
  const totalLots = allLots.length;
  const totalKg = allLots.reduce((s, l) => s + Number(l.net_wt ?? 0), 0);

  // ── Proceeds & VAT ──
  const proceeds = allLines.reduce((s, l) => s + Number(l.proceeds ?? 0), 0);
  const vatCash = allLines.filter((l) => !l.on_guarantee).reduce((s, l) => s + Number(l.vat_amount ?? 0), 0);
  const vatGuarantee = allLines.filter((l) => l.on_guarantee).reduce((s, l) => s + Number(l.vat_amount ?? 0), 0);
  const soldLots = allLines.length;
  const soldKg = allLines.reduce((s, l) => s + Number(l.net_wt ?? 0), 0);

  // ── Realised vs valuation premium (only lots that were both valued and sold) ──
  const projByLot = new Map<string, number>((vals ?? []).map((v) => [v.lot_id as string, Number(v.projected_proceeds ?? 0)]));
  let realisedForValued = 0;
  let projectedForValued = 0;
  for (const l of allLines) {
    const proj = projByLot.get(l.lot_id as string);
    if (proj != null && proj > 0) {
      realisedForValued += Number(l.proceeds ?? 0);
      projectedForValued += proj;
    }
  }
  const premiumPct = projectedForValued > 0 ? ((realisedForValued - projectedForValued) / projectedForValued) * 100 : null;

  // ── Settlement vs bank ──
  const expectedSettlement = (settlements ?? []).reduce((s, st) => s + Number(st.total_net_proceeds ?? 0), 0);
  const received = (bank ?? [])
    .filter((b) => b.match_status === "matched")
    .reduce((s, b) => s + Number(b.credit ?? 0), 0);
  const outstanding = expectedSettlement - received;

  // ── Per-sale rollup ──
  const proceedsBySale = new Map<string, number>();
  const lotsBySale = new Map<string, { count: number; kg: number }>();
  for (const l of allLots) {
    const e = lotsBySale.get(l.sale_id) ?? { count: 0, kg: 0 };
    e.count += 1;
    e.kg += Number(l.net_wt ?? 0);
    lotsBySale.set(l.sale_id, e);
  }
  for (const l of allLines) {
    proceedsBySale.set(l.sale_id as string, (proceedsBySale.get(l.sale_id as string) ?? 0) + Number(l.proceeds ?? 0));
  }
  const settlementBySale = new Map<string, number>();
  for (const st of settlements ?? []) {
    settlementBySale.set(st.sale_id as string, (settlementBySale.get(st.sale_id as string) ?? 0) + Number(st.total_net_proceeds ?? 0));
  }

  const reprintCount = byState.get("re-print")?.count ?? 0;
  const pendingKg = byState.get("pending")?.kg ?? 0;

  const cards: { label: string; value: string; sub?: string }[] = [
    { label: "Lot invoices", value: String(totalLots), sub: KG(totalKg) + " net" },
    { label: "Sold", value: `${soldLots} lots`, sub: LKR(proceeds) + " proceeds" },
    {
      label: "VAT collected",
      value: LKR(vatCash + vatGuarantee),
      sub: `${LKR(vatCash)} cash · ${LKR(vatGuarantee)} on guarantee`,
    },
    {
      label: "Realised vs valuation",
      value: premiumPct == null ? "—" : `${premiumPct >= 0 ? "+" : ""}${premiumPct.toFixed(1)}%`,
      sub: projectedForValued > 0 ? `${LKR(realisedForValued)} vs ${LKR(projectedForValued)} est.` : "no valued+sold lots yet",
    },
    { label: "Settlement outstanding", value: LKR(outstanding), sub: `${LKR(received)} of ${LKR(expectedSettlement)} received` },
    { label: "Rolling forward", value: `${reprintCount} re-print`, sub: `${KG(pendingKg)} pending at store` },
  ];

  const maxStateCount = Math.max(1, ...STATE_ORDER.map((s) => byState.get(s.key)?.count ?? 0));

  const bySaleRows: BySaleRow[] = allSales.map((s) => {
    const lc = lotsBySale.get(s.id) ?? { count: 0, kg: 0 };
    return {
      id: s.id,
      saleNo: formatFourDigitNo(s.sale_no as string | null),
      targetSaleNo: formatSaleNo((s as { target_sale_no?: string | null }).target_sale_no),
      broker: (s.brokers as unknown as { name: string } | null)?.name ?? "—",
      status: s.status,
      statusChip: STATE_ORDER.find((x) => x.key === s.status)?.chip ?? "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300",
      lotsCount: lc.count,
      netKg: lc.kg,
      proceeds: proceedsBySale.has(s.id) ? proceedsBySale.get(s.id)! : null,
      settlement: settlementBySale.has(s.id) ? settlementBySale.get(s.id)! : null,
    };
  });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">Auction dashboard</h2>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          Highlights across every dispatch and sale — lot lifecycle, proceeds, VAT, valuation premium and settlement.
        </p>
      </div>

      {totalLots === 0 ? (
        <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-8 text-center text-stone-500 dark:text-stone-400">
          Nothing to show yet.{" "}
          <Link href="/dashboard/auction/new" className="text-green-700 dark:text-green-400 hover:underline">
            Create a dispatch
          </Link>{" "}
          to get started.
        </div>
      ) : (
        <>
          {/* Highlight cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => (
              <div key={c.label} className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-4">
                <div className="text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">{c.label}</div>
                <div className="mt-1 text-2xl font-semibold text-stone-800 dark:text-stone-100">{c.value}</div>
                {c.sub && <div className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">{c.sub}</div>}
              </div>
            ))}
          </div>

          {/* Lots by state */}
          <section>
            <h3 className="mb-3 text-lg font-medium text-stone-700 dark:text-stone-300">Lots by state</h3>
            <div className="space-y-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-4">
              {STATE_ORDER.filter((s) => byState.has(s.key)).map((s) => {
                const e = byState.get(s.key)!;
                return (
                  <div key={s.key} className="flex items-center gap-3 text-sm">
                    <div className="w-24 shrink-0 text-stone-600 dark:text-stone-400">{s.label}</div>
                    <div className="h-5 flex-1 overflow-hidden rounded bg-stone-100 dark:bg-stone-800">
                      <div className={`h-full ${s.bar}`} style={{ width: `${Math.round((e.count / maxStateCount) * 100)}%` }} />
                    </div>
                    <div className="w-32 shrink-0 text-right tabular-nums text-stone-600 dark:text-stone-400">
                      {e.count} · {KG(e.kg)}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Per-sale detail */}
          <section>
            <h3 className="mb-3 text-lg font-medium text-stone-700 dark:text-stone-300">By sale</h3>
            <BySaleTable rows={bySaleRows} />
          </section>
        </>
      )}
    </div>
  );
}
