import "server-only";

import type { DispatchSheetRow } from "@tea/api";
import type { JobRunItem } from "@/lib/background-jobs";
import type { requireProfile } from "@/lib/profile";
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
  /** Parser-rejected rows. Carried here rather than written onto the run when
   * queued, so an import that has not started does not already show 112
   * skipped. The worker attaches them when it finishes. */
  skipped?: JobRunItem[];
};

export type RowLookups = {
  brokerIdByName: Map<string, string>;
  markIdByCode: Map<string, string>;
  /** Every spelling the factory accepts — codes and their aliases — mapped to
   * the code to write. `auction_lots.grade` is foreign-keyed, so a broker's
   * spelling must be canonicalised before it is persisted, never after. */
  gradeCodeBySpelling: Map<string, string>;
};

/** Broker spellings this book is known to use, for grades a factory will
 * already have. Seeds `auction_grade_aliases` on first import; after that the
 * table is the source of truth and the owner can add more. */
export const KNOWN_GRADE_ALIASES: Record<string, string> = {
  PEKOE: "PEKO",
  PEKOE1: "PEKO1",
  "B.M": "BM",
  DUST1: "DUST",
  FBOPFSP: "FBOFSP",
  "OP 1": "OP1",
};

export const normalizeSpelling = (value: string) => value.trim().toUpperCase();

/**
 * Broker and mark ids, by the spellings the book uses.
 *
 * Read per chunk rather than carried on the payload: a broker registered while
 * the import is running should be picked up, not refused because the run was
 * queued before it existed.
 */
export async function buildRowLookups(supabase: Supa, factoryId: string): Promise<RowLookups> {
  const [{ data: brokerRows }, { data: markRows }, { data: gradeRows }, { data: aliasRows }] = await Promise.all([
    supabase.from("brokers").select("id, name").eq("factory_id", factoryId),
    supabase.from("marks").select("id, code, name").eq("factory_id", factoryId),
    supabase.from("auction_grades").select("id, code").eq("factory_id", factoryId),
    supabase.from("auction_grade_aliases").select("alias, grade_id").eq("factory_id", factoryId),
  ]);
  const brokerIdByName = new Map((brokerRows ?? []).map((row) => [normalizeSpelling(row.name as string), row.id as string]));
  const markIdByCode = new Map<string, string>();
  for (const mark of markRows ?? []) {
    markIdByCode.set(normalizeSpelling(mark.code as string), mark.id as string);
    if (mark.name) markIdByCode.set(normalizeSpelling(mark.name as string), mark.id as string);
  }

  const codeById = new Map((gradeRows ?? []).map((row) => [row.id as string, row.code as string]));
  const gradeCodeBySpelling = new Map<string, string>();
  for (const code of codeById.values()) gradeCodeBySpelling.set(normalizeSpelling(code), code);
  for (const alias of aliasRows ?? []) {
    const code = codeById.get(alias.grade_id as string);
    if (code) gradeCodeBySpelling.set(normalizeSpelling(alias.alias as string), code);
  }
  return { brokerIdByName, markIdByCode, gradeCodeBySpelling };
}

/** The code to write for a row. Resolved through the factory's own aliases —
 * the book writes PEKOE, B.M, DUST1 for grades registered as PEKO, BM, DUST,
 * and the foreign key rejects the raw spelling. */
function gradeForRow(row: DispatchSheetRow, lookups: RowLookups): string {
  const spelling = normalizeSpelling(row.grade);
  return lookups.gradeCodeBySpelling.get(spelling) ?? row.grade.trim();
}

/** Form fields for one ordinary lot invoice, exactly as the Invoice Overview
 * draft row submits them. */
export function invoiceFormData(row: DispatchSheetRow, brokerId: string, markId: string, cutoverDate: string, lookups: RowLookups): FormData {
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
  form.set("grade", gradeForRow(row, lookups));
  form.set("bags", String(row.bags));
  form.set("kg_per_bag", String(row.kgPerBag));
  form.set("sample_allowance", String(row.sampleWeightKg));
  if (row.lotNo) form.set("lot_no", row.lotNo);
  return form;
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
  const { row, lookups, cutoverDate } = input;
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

  const form = invoiceFormData(row, brokerId, markId, cutoverDate, lookups);

  // Every book re-print goes to the cutover register, dispatched or not.
  // The dispatched kind used to be created as an invoice and then marked, but
  // marking demands an acknowledged lot and a lot created seconds earlier never
  // is — the rows failed every time. The register records the original sale
  // (target_sale_no) and the sale it sold in, so nothing about its origin is
  // lost, and it appears on the Re-print Overview to be caught up later.
  if (row.isReprint) {
    form.set("target_sale_no", formatSaleNo(row.saleNo ?? ""));
    form.set("sold_sale_no", formatSaleNo(row.nextSaleNo ?? ""));
    form.set("sample_allowance", String(row.sampleWeightKg + row.additionalSampleKg));
    form.set(
      "reason",
      `Imported from the Dispatch Schedule, sheet row ${row.sheetRow}.` +
        (row.dispatchDate ? ` Dispatched ${row.dispatchDate}${row.saleNo ? ` for sale ${formatSaleNo(row.saleNo)}` : ""}.` : ""),
    );
    const result = await input.registerReprint(form);
    return result.ok
      ? item("reprint", result.notice ?? "Registered as an outstanding re-print.")
      : item("failed", result.error);
  }

  const result = await input.createInvoice(form);
  if (!result.ok) return item("failed", result.error);
  return item("imported", result.notice ?? "Invoice created.");
}
