// Shared (non-action) helpers for the auction reconciliation screens. Kept out of
// actions.ts because a "use server" module may only export async server actions.
import type { InvoicedLot } from "@tea/api";
import { formatFourDigitNo } from "./sale-number";

type LotRow = {
  id: string;
  invoice_no: string;
  grade: string;
  net_wt: string | number;
  lot_invoices?: { invoice_no: string }[] | null;
};

// One reconcilable entry per (lot, invoice number). A lot usually yields one entry
// but a multi-invoice lot yields several; reconciliation keys on invoice_no and the
// lot id is preserved so cataloguing updates the parent lot. Falls back to the
// denormalized primary invoice_no when no lot_invoices rows exist (legacy rows).
export function buildInvoicedLots(rows: LotRow[]): InvoicedLot[] {
  return rows.flatMap((l) => {
    const invs = (l.lot_invoices ?? []).map((i) => i.invoice_no);
    const list = invs.length ? invs : [l.invoice_no];
    return list.map((invoiceNo) => ({ id: l.id, invoiceNo: formatFourDigitNo(invoiceNo), grade: l.grade, netWt: Number(l.net_wt) }));
  });
}
