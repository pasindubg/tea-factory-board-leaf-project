import { requireModuleAccess } from "@/lib/profile";
import { formatFourDigitNo, formatSaleNo } from "../sale-number";
import { stateBucket } from "../state-buckets";
import { ReprintOverviewTable, type ReprintOverviewRow } from "./reprint-overview-table";

type ReprintLot = {
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
  created_at: string | null;
  lot_source: string | null;
  lot_invoices: { invoice_no: string }[] | null;
  sale_lines: { net_wt: number | string | null; price_per_kg: number | string | null }[] | null;
  auction_sales: {
    id: string;
    sale_no: string | null;
    target_sale_no: string | null;
    dispatch_date: string | null;
    sale_date: string | null;
    brokers: { name: string } | null;
  } | null;
};

export default async function ReprintOverviewPage() {
  const { supabase } = await requireModuleAccess("auction");
  const { data: lots, error } = await supabase
    .from("auction_lots")
    .select(
      "id, sale_id, invoice_no, lot_no, grade, bags, kg_per_bag, sample_allowance, net_wt, state, lot_source, reprint_source_lot_id, created_at, " +
        "lot_invoices(invoice_no), sale_lines(net_wt, price_per_kg), " +
        "auction_sales(id, sale_no, target_sale_no, dispatch_date, sale_date, brokers(name))",
    )
    .or("state.eq.re-print,reprint_source_lot_id.not.is.null")
    .order("created_at");

  if (error) throw new Error(`Could not load re-print overview: ${error.message}`);

  const lotRows = (lots ?? []) as unknown as ReprintLot[];
  const lotById = new Map(lotRows.map((lot) => [lot.id, lot]));
  const rootIdFor = (lot: ReprintLot) => {
    let current = lot;
    const seen = new Set<string>();
    while (current.reprint_source_lot_id && lotById.has(current.reprint_source_lot_id) && !seen.has(current.id)) {
      seen.add(current.id);
      current = lotById.get(current.reprint_source_lot_id)!;
    }
    return current.id;
  };
  const chains = new Map<string, ReprintLot[]>();
  for (const lot of lotRows) {
    const rootId = rootIdFor(lot);
    const chain = chains.get(rootId) ?? [];
    chain.push(lot);
    chains.set(rootId, chain);
  }

  const rows: ReprintOverviewRow[] = [...chains.entries()].map(([rootId, unsortedChain]) => {
    const chain = [...unsortedChain].sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
    const lot = lotById.get(rootId) ?? chain[0];
    const terminal = [...chain].reverse().find((node) => node.state === "sold" || node.state === "settled" || (node.sale_lines?.length ?? 0) > 0);
    const invoices = [...new Set(chain.flatMap((node) => (node.lot_invoices ?? []).map((invoice) => formatFourDigitNo(invoice.invoice_no))).filter(Boolean))];
    const reprintNodes = chain.filter((node) => node.state === "re-print");
    const saleLabel = (node: ReprintLot) => formatSaleNo(node.auction_sales?.target_sale_no ?? node.auction_sales?.sale_no ?? null) ?? "—";
    const state = stateBucket(terminal?.state ?? chain[chain.length - 1]?.state);
    const totalSampleKg = Math.max(0, ...chain.map((node) => Number(node.sample_allowance ?? 0)));
    const soldLine = terminal?.sale_lines?.[0];
    return {
      id: lot.id,
      dispatchId: lot.auction_sales?.id ?? lot.sale_id,
      dispatchNo: formatFourDigitNo(lot.auction_sales?.sale_no ?? null),
      saleNo: formatSaleNo(lot.auction_sales?.target_sale_no ?? null),
      broker: lot.auction_sales?.brokers?.name ?? "—",
      dispatchDate: lot.auction_sales?.dispatch_date ?? null,
      saleDate: lot.auction_sales?.sale_date ?? null,
      invoiceNo: invoices.length > 0 ? invoices.join(", ") : formatFourDigitNo(lot.invoice_no),
      lotNo: formatFourDigitNo(lot.lot_no),
      grade: lot.grade,
      bags: lot.bags,
      kgPerBag: lot.kg_per_bag != null ? Number(lot.kg_per_bag) : null,
      totalSampleKg,
      remainingNetKg: Number(chain[chain.length - 1]?.net_wt ?? 0),
      actualSoldKg: terminal ? Number(soldLine?.net_wt ?? terminal.net_wt ?? 0) : null,
      reprintSales: reprintNodes.map(saleLabel).join(", ") || "—",
      soldSale: terminal ? saleLabel(terminal) : null,
      history: chain.map((node) => `${saleLabel(node)} ${stateBucket(node.state).label}`).join(" → "),
      source: lot.lot_source,
      stateLabel: state.label,
      stateStyle: state.style,
      reprintCount: reprintNodes.length,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Re-print Overview</h2>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Broker-invoice lots marked as re-print, with original lot attributes and forward re-print counts.
        </p>
      </div>
      <ReprintOverviewTable rows={rows} />
    </div>
  );
}
