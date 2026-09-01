// Loads the inputs for the sale-revenue re-validation and runs it.
//
// Lives here so the sale detail page and the sellers contract page reach the
// same verdict from the same data — they render it differently, but they must
// never disagree about whether a sale tallies.
//
// Not "use server": a helper for server components, not a server action.
import { validateSaleRevenue, type RevenueValidation } from "@tea/api";
import type { Supa } from "./_shared";

export async function loadSaleRevenueCheck(
  supabase: Supa,
  factoryId: string,
  saleIds: readonly string[],
  computedRevenue: number,
): Promise<RevenueValidation> {
  if (saleIds.length === 0) {
    return { status: "pending", reason: "No sellers contract has been confirmed for this sale yet." };
  }

  const [{ data: contractDocs }, { data: settlements }] = await Promise.all([
    supabase
      .from("doc_imports")
      .select("id, sale_id, printed_net_proceeds, printed_insurance, auction_sales(brokers(name))")
      .eq("factory_id", factoryId)
      .eq("doc_type", "contract")
      .eq("status", "confirmed")
      .in("sale_id", saleIds),
    // Our OWN insurance, per dispatch invoice, so it can be compared against the
    // contract that covers those same invoices rather than against the sale.
    supabase
      .from("settlements")
      .select("sale_id, settlement_charges(code, amount)")
      .eq("factory_id", factoryId)
      .in("sale_id", saleIds),
  ]);

  const insuranceBySaleId = new Map<string, number>();
  for (const row of (settlements ?? []) as unknown as {
    sale_id: string;
    settlement_charges: { code: string; amount: string | number }[] | null;
  }[]) {
    const insurance = (row.settlement_charges ?? [])
      .filter((c) => c.code === "insurance")
      .reduce((sum, c) => sum + Number(c.amount ?? 0), 0);
    insuranceBySaleId.set(row.sale_id, (insuranceBySaleId.get(row.sale_id) ?? 0) + insurance);
  }

  return validateSaleRevenue(
    computedRevenue,
    ((contractDocs ?? []) as unknown as {
      id: string;
      sale_id: string | null;
      printed_net_proceeds: string | number | null;
      printed_insurance: string | number | null;
      auction_sales: { brokers: { name: string } | null } | null;
    }[]).map((doc) => ({
      id: doc.id,
      brokerName: doc.auction_sales?.brokers?.name ?? null,
      printedNetProceeds: doc.printed_net_proceeds == null ? null : Number(doc.printed_net_proceeds),
      printedInsurance: doc.printed_insurance == null ? null : Number(doc.printed_insurance),
      computedInsurance: doc.sale_id == null ? null : insuranceBySaleId.get(doc.sale_id) ?? 0,
    })),
    // The broker's VAT on its own charges. Insurance sits inside the charges
    // that carry it, so swapping the figure moves deductions by that much more.
    { chargesVatPct: await chargesVatPct(supabase, factoryId) },
  );
}

/**
 * The charges-VAT rate in force. Read from the stored rate card rather than
 * assumed: hard-coding 18 here would silently mis-state the adjustment the
 * moment the rate moved.
 */
async function chargesVatPct(supabase: Supa, factoryId: string): Promise<number> {
  const { data } = await supabase
    .from("broker_rates")
    .select("charges_vat_pct")
    .eq("factory_id", factoryId)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  return Number(data?.charges_vat_pct ?? 0);
}
