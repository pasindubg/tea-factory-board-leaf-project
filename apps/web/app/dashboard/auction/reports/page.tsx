import { requireModuleAccess } from "@/lib/profile";
import { ingestAckAuto, ingestValAuto, ingestConAuto, ingestBankAuto } from "../actions";
import { ReportsTabs } from "./reports-tabs";
import { SettlementsTable, type SettlementRow } from "./settlements-table";
import { formatFourDigitNo, formatSaleNo } from "../sale-number";
import { DocumentImportList } from "./document-import-list";
import { EntityListTabs } from "@/components/entity-list";

export default async function ReportsPage() {
  const { supabase } = await requireModuleAccess("auction");

  const [
    { data: settlements },
    { data: bankMatched },
    { data: vatLedger },
    { data: imports },
  ] = await Promise.all([
    supabase
      .from("settlements")
      .select("id, sale_id, contract_no, proceeds_total, total_deductions, net_proceeds, output_vat, total_net_proceeds, prompt_date, auction_sales(sale_no, target_sale_no, brokers(name))")
      .order("prompt_date", { ascending: false }),
    supabase
      .from("bank_txns")
      .select("matched_settlement_id, credit")
      .not("matched_settlement_id", "is", null),
    supabase
      .from("vat_ledger")
      .select("mode, vat_amount, status"),
    supabase
      .from("doc_imports")
      .select("id, doc_type, source_filename, status, parsed_at, sale_id")
      .order("parsed_at", { ascending: false })
      .limit(20),
  ]);

  const creditedBySettlement = new Map<string, number>();
  for (const t of bankMatched ?? []) {
    const sid = t.matched_settlement_id as string;
    creditedBySettlement.set(sid, (creditedBySettlement.get(sid) ?? 0) + Number(t.credit ?? 0));
  }

  const vatTotals = { cash: 0, guarantee: 0 };
  for (const v of vatLedger ?? []) {
    const amt = Number(v.vat_amount ?? 0);
    if (v.mode === "cash") vatTotals.cash += amt;
    else vatTotals.guarantee += amt;
  }

  const rows = (settlements ?? []).map((st) => {
    const sale = (st.auction_sales as unknown as { sale_no: string; target_sale_no: string | null; brokers: { name: string } } | null);
    const credited = creditedBySettlement.get(st.id as string) ?? 0;
    const total = Number(st.total_net_proceeds ?? 0);
    const remaining = total - credited;
    return {
      id: st.id as string,
      contractNo: st.contract_no as string,
      dispatchNo: formatFourDigitNo(sale?.sale_no) || "—",
      saleNo: formatSaleNo(sale?.target_sale_no) || "—",
      broker: sale?.brokers?.name ?? "—",
      proceeds: Number(st.proceeds_total ?? 0),
      deductions: Number(st.total_deductions ?? 0),
      netProceeds: Number(st.net_proceeds ?? 0),
      outputVat: Number(st.output_vat ?? 0),
      totalNet: total,
      promptDate: st.prompt_date as string | null,
      credited,
      remaining,
      settled: Math.abs(remaining) < 1,
    };
  });

  const settlementRows: SettlementRow[] = rows;

  const allImports = (imports ?? []) as unknown as { id: string; doc_type: string; source_filename: string | null; status: string; parsed_at: string | null; sale_id: string | null }[];
  const ackImports = allImports.filter((i) => i.doc_type === "acknowledgement");
  const valImports = allImports.filter((i) => i.doc_type === "valuation");
  const conImports = allImports.filter((i) => i.doc_type === "contract");
  const bankImports = allImports.filter((i) => i.doc_type === "bank_csv");

  const overview = (
    <div className="space-y-8">
      {/* Settlement summary */}
      <section>
        <h3 className="text-lg font-medium text-stone-700 dark:text-stone-300">Settlement overview</h3>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
            <p className="text-xs text-stone-500 dark:text-stone-400">Total settlements</p>
            <p className="mt-1 text-2xl font-semibold text-stone-800 dark:text-stone-200">{rows.length}</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
            <p className="text-xs text-stone-500 dark:text-stone-400">Outstanding</p>
            <p className="mt-1 text-2xl font-semibold text-amber-700 dark:text-amber-400">
              LKR {rows.reduce((s, r) => s + r.remaining, 0).toLocaleString("en-LK", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
            <p className="text-xs text-stone-500 dark:text-stone-400">Guarantee VAT pending</p>
            <p className="mt-1 text-2xl font-semibold text-blue-800 dark:text-blue-400">
              LKR {vatTotals.guarantee.toLocaleString("en-LK", { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        <SettlementsTable rows={settlementRows} />
      </section>
    </div>
  );

  const upload = (
    <div className="space-y-8">
      {/* Upload blocks */}
      <section>
        <h3 className="text-lg font-medium text-stone-700 dark:text-stone-300">Upload &amp; auto-detect</h3>
        <p className="text-sm text-stone-500 dark:text-stone-400">Drop a broker PDF or bank CSV — the system parses the sale number and links it to the right broker invoice automatically.</p>
      </section>

      <EntityListTabs
        label="Auction report imports"
        tabs={[
          {
            id: "acknowledgements",
            label: "Acknowledgements",
            count: `${ackImports.length}`,
            content: <DocumentImportList title="Acknowledgement" description="Catalogue lots and reconcile (①) against what you invoiced; shutouts are flagged. Auto-detects the sale." action={ingestAckAuto} rows={ackImports} reviewType="ack" />,
          },
          {
            id: "valuations",
            label: "Valuations",
            count: `${valImports.length}`,
            content: <DocumentImportList title="Valuation report" description="Record the broker's per-lot valuation — price range, projected proceeds and tasting notes." action={ingestValAuto} rows={valImports} reviewType="valuation" />,
          },
          {
            id: "contracts",
            label: "Contracts",
            count: `${conImports.length}`,
            content: <DocumentImportList title="Sellers contract" description="Record the actual sale (buyer, price, VAT, guarantee) and reconcile (②) against the valuation." action={ingestConAuto} rows={conImports} reviewType="contract" />,
          },
          {
            id: "bank",
            label: "Bank statements",
            count: `${bankImports.length}`,
            content: <DocumentImportList title="Bank statement (CSV)" description="Upload the bank statement to reconcile (④) settlements against the credits that actually arrived." action={ingestBankAuto} rows={bankImports} reviewType="bank" accept=".csv,text/csv" />,
          },
        ]}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-stone-800 dark:text-stone-100">Report Reconciliations</h2>
      </div>
      <ReportsTabs overview={overview} upload={upload} />
    </div>
  );
}
