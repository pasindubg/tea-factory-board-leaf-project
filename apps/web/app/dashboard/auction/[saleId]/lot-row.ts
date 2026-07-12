// The lot row shape threaded from the dispatch-detail page through the editor,
// lots section, and table. One definition — it was previously copied into each
// component and had already started to drift.
export type LotRow = {
  id: string;
  invoice_no: string | null;
  lot_no: string | null;
  grade: string | null;
  bags: number | null;
  kg_per_bag: number | null;
  sample_allowance: string | number | null;
  net_wt: string | number | null;
  state: string | null;
  shutout_reason: string | null;
  lot_source: string | null;
  reprint_target_sale_id?: string | null;
  reprint_target_label?: string | null;
  threshold_min_net_kg: number | null;
  threshold_applies: boolean;
  marks: { code: string; name: string } | null;
  lot_invoices: { invoice_no: string }[] | null;
};
