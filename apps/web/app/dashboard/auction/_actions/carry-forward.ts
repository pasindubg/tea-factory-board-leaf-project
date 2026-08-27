// Resolves the acknowledgement rows recon ① could not place against lots the
// factory already holds elsewhere — a lot rolling forward from an earlier
// broker invoice, or a re-print registered on the Re-prints page.
//
// This module exists so the REVIEW SCREEN and the CONFIRM ACTION reach the
// same answer. They used to disagree by construction: reconcileAcknowledgement
// only compares against the lots invoiced in THIS sale group, so a carried-
// forward lot is `not-acknowledged` there no matter what, while confirmation
// quietly resolved it. The operator was told "Not acknowledged: 1" and watched the
// system do something else — exactly the noise the register was built to
// remove. Both paths now call resolveAckCarryForward.
//
// Not "use server": these are helpers for an action and a server component,
// not server actions themselves.
import { matchCarryForwardLot, carryForwardInvoiceFilters, isCarryForwardCandidate, type CarryForwardMatch } from "@tea/api";
import type { Supa } from "./_shared";

/** The stored lot behind a match, with every field the confirm path writes. */
export type CarryForwardLot = {
  id: string;
  sale_id: string;
  invoice_no: string | null;
  lot_no: string | null;
  grade: string | null;
  bags: number | null;
  kg_per_bag: number | string | null;
  gross_wt: number | string | null;
  sample_allowance: number | string | null;
  net_wt: number | string | null;
  state: string | null;
  unsold: boolean | null;
  reprint: boolean | null;
  auction_sales: {
    broker_id: string;
    sale_no: string | null;
    target_sale_no: string | null;
    dispatch_date: string | null;
    entry_source?: string | null;
  } | null;
  lot_invoices?: { invoice_no: string }[] | null;
};

export type AckRowKey = { invoiceNo: string; lotNo: string | null };

/**
 * Was this lot actually put in front of buyers in the sale it sits in?
 *
 * That single question separates the two ways a lot reaches a later sale, and
 * they are mutually exclusive:
 *
 *   offered, did not sell  → RE-PRINT      (`unsold`, or a valuation reached it,
 *                                           or it is already a re-print)
 *   never offered at all   → SKIPPED SALE  (the broker held it back and
 *                                           catalogued it in a later sale)
 *
 * A valuation is the evidence of being offered: the broker only values what it
 * catalogued and put up. A lot still at `invoiced`/`acknowledged` with no
 * valuation never faced a buyer, so it skipped that sale rather than failing in
 * it. `sold` cannot be carried forward at all, but it is listed for
 * completeness — a sold lot was plainly offered.
 */
function wasOffered(lot: CarryForwardLot): boolean {
  return Boolean(lot.unsold) || Boolean(lot.reprint) || lot.state === "valued" || lot.state === "sold";
}

export type CarryForwardOutcome =
  | { status: "matched"; lot: CarryForwardLot; isReprint: boolean }
  | { status: "blocked"; lot: CarryForwardLot }
  | { status: "unmatched" };

/**
 * Resolves each row IN ORDER, so one stored lot cannot be claimed twice — the
 * caller must pass rows in the same order it intends to process them.
 *
 * Returns a map keyed by the row's invoice number.
 */
export async function resolveAckCarryForward(
  supabase: Supa,
  factoryId: string,
  input: { groupIds: readonly string[]; brokerId: string | null; rows: readonly AckRowKey[] },
): Promise<Map<string, CarryForwardOutcome>> {
  const outcomes = new Map<string, CarryForwardOutcome>();
  if (input.rows.length === 0) return outcomes;

  const invoiceNos = [...new Set(input.rows.map((row) => row.invoiceNo).filter(Boolean))];
  const lotNos = [...new Set(input.rows.map((row) => row.lotNo).filter((lotNo): lotNo is string => Boolean(lotNo)))];

  // The stored number carries an index-cycle prefix the broker never prints,
  // so these are prefix-aware filters, not an exact `in.(...)`.
  const { data: linkedInvoiceLots } = invoiceNos.length > 0
    ? await supabase
        .from("lot_invoices")
        .select("lot_id, invoice_no")
        .eq("factory_id", factoryId)
        .or(carryForwardInvoiceFilters(invoiceNos).join(","))
    : { data: [] };
  const linkedLotIds = [...new Set((linkedInvoiceLots ?? []).map((row) => row.lot_id as string))];

  const parts: string[] = [];
  if (invoiceNos.length > 0) parts.push(...carryForwardInvoiceFilters(invoiceNos));
  if (lotNos.length > 0) parts.push(`lot_no.in.(${lotNos.join(",")})`);
  if (linkedLotIds.length > 0) parts.push(`id.in.(${linkedLotIds.join(",")})`);
  if (parts.length === 0) return outcomes;

  const { data: storedRows } = await supabase
    .from("auction_lots")
    .select("id, sale_id, invoice_no, lot_no, grade, bags, kg_per_bag, gross_wt, sample_allowance, net_wt, state, unsold, reprint, auction_sales(broker_id, sale_no, target_sale_no, dispatch_date, entry_source), lot_invoices(invoice_no)")
    .eq("factory_id", factoryId)
    .or(parts.join(","));
  const storedLots = (storedRows ?? []) as unknown as CarryForwardLot[];
  if (storedLots.length === 0) return outcomes;

  // A lot with sale proceeds recorded against it can never be moved.
  const { data: existingSaleLines } = await supabase
    .from("sale_lines")
    .select("lot_id")
    .in("lot_id", storedLots.map((lot) => lot.id));
  const soldLotIds = new Set((existingSaleLines ?? []).map((line) => line.lot_id as string));

  const lotById = new Map(storedLots.map((lot) => [lot.id, lot]));
  const candidates = storedLots
    .map((lot) => ({
      id: lot.id,
      saleId: lot.sale_id,
      invoiceNo: lot.invoice_no,
      lotNo: lot.lot_no,
      state: lot.state,
      brokerId: lot.auction_sales?.broker_id ?? null,
      dispatchDate: lot.auction_sales?.dispatch_date ?? null,
      invoiceNos: (lot.lot_invoices ?? []).map((invoice) => invoice.invoice_no),
      hasSaleLine: soldLotIds.has(lot.id),
    }))
    .filter((lot) => isCarryForwardCandidate(lot, { groupSaleIds: input.groupIds, brokerId: input.brokerId }));

  const used = new Set<string>();
  for (const row of input.rows) {
    const match: CarryForwardMatch = matchCarryForwardLot(row, candidates, used);
    if (match.status === "matched") {
      used.add(match.candidate.id);
      const lot = lotById.get(match.candidate.id)!;
      outcomes.set(row.invoiceNo, { status: "matched", lot, isReprint: wasOffered(lot) });
    } else if (match.status === "blocked") {
      outcomes.set(row.invoiceNo, { status: "blocked", lot: lotById.get(match.candidate.id)! });
    } else {
      outcomes.set(row.invoiceNo, { status: "unmatched" });
    }
  }
  return outcomes;
}
