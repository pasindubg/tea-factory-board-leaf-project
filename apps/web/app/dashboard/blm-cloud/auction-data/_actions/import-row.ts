import "server-only";

import { carryForwardInvoiceFilters, type DispatchSheetRow } from "@tea/api";
import { friendlyError } from "@/lib/errors";
import type { JobRunItem } from "@/lib/background-jobs";
import type { requireProfile } from "@/lib/profile";
import { markReprint } from "@/app/dashboard/auction/actions";
import { formatFourDigitNo, formatSaleNo } from "@/app/dashboard/auction/sale-number";

/**
 * Applying ONE row of the Dispatch Schedule.
 *
 * Deliberately not in import.ts: that file is "use server", so everything it
 * exports becomes a callable endpoint. This is called by the background job
 * handler, which is server-internal, and must not be reachable from a browser.
 *
 * Every row still goes through the same server actions the Invoice Overview
 * page uses — that was the point of the import, and it survives the move to a
 * worker unchanged, because the access gates now resolve from the job's actor
 * instead of a cookie (see lib/jobs/context.ts).
 */

type Supa = Awaited<ReturnType<typeof requireProfile>>["supabase"];
type ActionResult = { ok: true; notice?: string } | { ok: false; error: string };

/** The run's input: parsed once when queued, read by the worker later. Must be
 * self-contained — the worker has no upload to re-read. */
export type DispatchImportPayload = {
  rows: DispatchSheetRow[];
  cutoverDate: string;
};

export type RowLookups = {
  brokerIdByName: Map<string, string>;
  markIdByCode: Map<string, string>;
};

const KNOWN_GRADE_ALIASES: Record<string, string> = {};
export const normalizeSpelling = (value: string) => value.trim().toUpperCase();

/**
 * Broker and mark ids, by the spellings the book uses.
 *
 * Read per chunk rather than carried on the payload: a broker registered while
 * the import is running should be picked up, not refused because the run was
 * queued before it existed.
 */
export async function buildRowLookups(supabase: Supa, factoryId: string): Promise<RowLookups> {
  const [{ data: brokerRows }, { data: markRows }] = await Promise.all([
    supabase.from("brokers").select("id, name").eq("factory_id", factoryId),
    supabase.from("marks").select("id, code, name").eq("factory_id", factoryId),
  ]);
  const brokerIdByName = new Map((brokerRows ?? []).map((row) => [normalizeSpelling(row.name as string), row.id as string]));
  const markIdByCode = new Map<string, string>();
  for (const mark of markRows ?? []) {
    markIdByCode.set(normalizeSpelling(mark.code as string), mark.id as string);
    if (mark.name) markIdByCode.set(normalizeSpelling(mark.name as string), mark.id as string);
  }
  return { brokerIdByName, markIdByCode };
}

function gradeForRow(row: DispatchSheetRow): string {
  return KNOWN_GRADE_ALIASES[normalizeSpelling(row.grade)] ?? row.grade.trim();
}

/** Form fields for one ordinary lot invoice, exactly as the Invoice Overview
 * draft row submits them. */
export function invoiceFormData(row: DispatchSheetRow, brokerId: string, markId: string, cutoverDate: string): FormData {
  // An outstanding re-print has no dispatch date in the book; it is registered
  // as of the cutover day instead.
  const dispatchDate = row.dispatchDate ?? row.saleDate ?? cutoverDate;
  const form = new FormData();
  form.set("broker_id", brokerId);
  form.set("selling_mark_id", markId);
  form.set("dispatch_date", dispatchDate);
  form.set("sale_date", row.saleDate ?? dispatchDate);
  form.set("target_sale_no", formatSaleNo(row.saleNo ?? row.nextSaleNo ?? ""));
  form.set("invoice_no", formatFourDigitNo(row.invoiceNo));
  form.set("grade", gradeForRow(row));
  form.set("bags", String(row.bags));
  form.set("kg_per_bag", String(row.kgPerBag));
  form.set("sample_allowance", String(row.sampleWeightKg));
  if (row.lotNo) form.set("lot_no", row.lotNo);
  return form;
}

/**
 * Moves a just-imported lot to `re-print`, recording the sale it sold in.
 *
 * The lot is found by its invoice number because `createInvoiceFromOverview`
 * deliberately returns no row — the overview refetches rather than splicing in
 * a locally-built one — and the import needs the id to transition it.
 */
export async function markImportedLotAsReprint(
  supabase: Supa,
  factoryId: string,
  row: DispatchSheetRow,
): Promise<{ ok: true; detail: string } | { ok: false; error: string }> {
  const invoiceNo = formatFourDigitNo(row.invoiceNo);
  const { data: invoiceRows, error: lookupError } = await supabase
    .from("lot_invoices")
    .select("lot_id, invoice_no")
    .eq("factory_id", factoryId)
    .or(carryForwardInvoiceFilters([invoiceNo]).join(","));
  if (lookupError) return { ok: false, error: friendlyError(lookupError) };
  const lotId = (invoiceRows ?? [])[0]?.lot_id as string | undefined;
  if (!lotId) return { ok: false, error: `Invoice ${invoiceNo} was created but could not be found again to mark as a re-print.` };

  const { data: lot, error: lotError } = await supabase
    .from("auction_lots")
    .select("id, sale_id")
    .eq("id", lotId)
    .eq("factory_id", factoryId)
    .maybeSingle();
  if (lotError) return { ok: false, error: friendlyError(lotError) };
  if (!lot) return { ok: false, error: `Invoice ${invoiceNo} could not be re-read to mark as a re-print.` };

  const form = new FormData();
  form.set("additional_sample_kg", String(row.additionalSampleKg));
  const marked = await markReprint(lot.id as string, lot.sale_id as string, form);
  if (!marked.ok) return { ok: false, error: marked.error };

  // The second sale number: where it actually sold after being re-printed.
  const soldSaleNo = formatSaleNo(row.nextSaleNo ?? "");
  if (soldSaleNo) {
    const { error } = await supabase
      .from("auction_lots")
      .update({ final_sale_no: soldSaleNo })
      .eq("id", lot.id as string)
      .eq("factory_id", factoryId);
    if (error) return { ok: false, error: friendlyError(error) };
  }
  return {
    ok: true,
    detail: `Marked as re-print${row.saleNo ? `, first offered in sale ${formatSaleNo(row.saleNo)}` : ""}${soldSaleNo ? `, sold in sale ${soldSaleNo}` : ""}.`,
  };
}

/**
 * One row, start to finish, returning what to record about it.
 *
 * Lifted verbatim from the loop that used to live inside the import action, so
 * the behaviour a chunked worker produces is the behaviour the inline version
 * produced.
 */
export async function applyImportRow(input: {
  row: DispatchSheetRow;
  lookups: RowLookups;
  cutoverDate: string;
  supabase: Supa;
  factoryId: string;
  createInvoice: (form: FormData) => Promise<ActionResult>;
  registerReprint: (form: FormData) => Promise<ActionResult>;
}): Promise<JobRunItem> {
  const { row, lookups, cutoverDate, supabase, factoryId } = input;
  const item = (status: string, detail: string): JobRunItem => ({
    ref: String(row.sheetRow),
    label: formatFourDigitNo(row.invoiceNo),
    status,
    detail,
  });

  const brokerId = lookups.brokerIdByName.get(normalizeSpelling(row.brokerName));
  if (!brokerId) return item("failed", `Broker "${row.brokerName}" is not registered.`);
  const markId = lookups.markIdByCode.get(normalizeSpelling(row.markCode));
  if (!markId) return item("failed", `Selling mark "${row.markCode}" is not registered.`);

  const form = invoiceFormData(row, brokerId, markId, cutoverDate);

  // Only a re-print the book never dispatched belongs in the cutover register.
  // The book marks a row "Reprint" for BOTH cases: a lot dispatched from here
  // that went unsold and was re-printed (an ordinary lifecycle this system
  // models in full), and a lot already sitting at the broker from a sale that
  // predates the book. The dispatch date separates them — the second kind has
  // none, because it never left here. Registering the first kind would badge a
  // real dispatch as a cutover entry and hide the sale it came from.
  if (row.isReprint && !row.dispatchDate) {
    form.set("target_sale_no", formatSaleNo(row.saleNo ?? ""));
    form.set("sold_sale_no", formatSaleNo(row.nextSaleNo ?? ""));
    form.set("sample_allowance", String(row.sampleWeightKg + row.additionalSampleKg));
    form.set("reason", `Imported from the Dispatch Schedule, sheet row ${row.sheetRow}.`);
    const result = await input.registerReprint(form);
    return result.ok
      ? item("reprint", result.notice ?? "Registered as an outstanding re-print.")
      : item("failed", result.error);
  }

  const result = await input.createInvoice(form);
  if (!result.ok) return item("failed", result.error);

  // A dispatched lot the book marks as re-printed: created as an ordinary
  // invoice above, then moved through the SAME owner action the Lots list uses,
  // so the sampling deduction and audit entry are identical.
  if (row.isReprint) {
    const marked = await markImportedLotAsReprint(supabase, factoryId, row);
    return marked.ok ? item("reprint", marked.detail) : item("failed", marked.error);
  }
  return item("imported", result.notice ?? "Invoice created.");
}
