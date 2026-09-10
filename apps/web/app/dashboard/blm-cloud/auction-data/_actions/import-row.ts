import "server-only";

import type { DispatchSheetRow } from "@tea/api";
import type { JobRunItem } from "@/lib/background-jobs";
import type { requireProfile } from "@/lib/profile";
import { formatFourDigitNo, formatSaleNo } from "@/app/dashboard/auction/sale-number";
import { CATEGORY_LABEL, type InvoiceCategory } from "@/app/dashboard/auction/invoice-number";

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
  /** The ACTIVE number prefix per category. Every row needs both: one numbers
   * the dispatch invoice it is filed under, the other the lot invoice itself,
   * and neither is created by the import. The prefix string matters too — it
   * is half of a stored invoice number's identity ("26I01-0941"). */
  activePrefixByCategory: Map<string, string>;
};

/** Both prefixes a row consumes, so the absence of either is reported once
 * rather than 264 times. */
const REQUIRED_PREFIX_CATEGORIES: InvoiceCategory[] = ["broker_invoice", "regular_invoice"];

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
  const [brokers, marks, grades, aliases, prefixes] = await Promise.all([
    supabase.from("brokers").select("id, name").eq("factory_id", factoryId),
    supabase.from("marks").select("id, code, name").eq("factory_id", factoryId),
    supabase.from("auction_grades").select("id, code").eq("factory_id", factoryId),
    supabase.from("auction_grade_aliases").select("alias, grade_id").eq("factory_id", factoryId),
    supabase.from("invoice_number_prefixes").select("category, prefix").eq("factory_id", factoryId).eq("active", true),
  ]);
  // A registry that cannot be READ looks exactly like an empty one, and an
  // empty one fails every row with "not registered" — a message that sends the
  // operator to re-register brokers that are already there. Say what happened.
  for (const [label, result] of [["brokers", brokers], ["selling marks", marks], ["grades", grades], ["grade aliases", aliases], ["invoice number prefixes", prefixes]] as const) {
    if (result.error) throw new Error(`Could not read the factory's ${label}: ${result.error.message}`);
  }
  const { data: brokerRows } = brokers;
  const { data: markRows } = marks;
  const { data: gradeRows } = grades;
  const { data: aliasRows } = aliases;
  const activePrefixByCategory = new Map((prefixes.data ?? []).map((row) => [row.category as string, row.prefix as string]));

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
  return { brokerIdByName, markIdByCode, gradeCodeBySpelling, activePrefixByCategory };
}

/**
 * Why the import cannot proceed, or null when nothing stands in its way.
 *
 * Brokers, marks and number prefixes are configuration the import deliberately
 * does not create, so a sheet that needs one the factory has not set up can
 * only fail — and it fails identically on every single row. Stating it ONCE,
 * with what the factory actually holds, is the difference between a fixable
 * message and 264 copies of an unfixable one.
 */
export function registryGap(rows: DispatchSheetRow[], lookups: RowLookups): string | null {
  const missing = (values: string[], known: Map<string, string>) =>
    [...new Set(values)].filter((value) => !known.has(normalizeSpelling(value))).sort();
  const brokers = missing(rows.map((row) => row.brokerName), lookups.brokerIdByName);
  const marks = missing(rows.map((row) => row.markCode), lookups.markIdByCode);
  const prefixes = REQUIRED_PREFIX_CATEGORIES.filter((category) => !lookups.activePrefixByCategory.has(category));
  if (brokers.length === 0 && marks.length === 0 && prefixes.length === 0) return null;

  const held = (known: Map<string, string>) => [...known.keys()].sort().join(", ") || "nothing";
  const registry = [
    ...(brokers.length > 0 ? [`The sheet's brokers ${brokers.join(", ")} are not registered — this factory has ${held(lookups.brokerIdByName)}.`] : []),
    ...(marks.length > 0 ? [`The sheet's selling marks ${marks.join(", ")} are not registered — this factory has ${held(lookups.markIdByCode)}.`] : []),
  ];
  const parts = [
    ...registry,
    ...(registry.length > 0 ? ["Register them under Auction → Registry, spelled as the book spells them."] : []),
    ...(prefixes.length > 0
      ? [`Every row also needs a number prefix that does not exist: no ACTIVE ${prefixes.map((category) => CATEGORY_LABEL[category]).join(" or ")} prefix is configured. Create and activate one of each under Auction → Invoice number prefixes.`]
      : []),
  ];
  return `${parts.join(" ")} Then import again.`;
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
export function invoiceFormData(row: DispatchSheetRow, brokerId: string, markId: string, lookups: RowLookups): FormData {
  const form = new FormData();
  form.set("broker_id", brokerId);
  form.set("selling_mark_id", markId);
  form.set("dispatch_date", row.dispatchDate);
  form.set("sale_date", row.saleDate ?? row.dispatchDate);
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
 * EVERY row becomes an ordinary lot invoice. The book flags some rows
 * "Reprint", and that flag is deliberately not imported: a re-print is a
 * relationship between two sales that the LATER sale's acknowledgement
 * evidences and links through `reprint_source_lot_id`. Declaring it from the
 * spreadsheet would assert a history no document has shown yet — the
 * distinction `reprint_registered` exists to preserve — and would file a lot
 * that really was dispatched under the cutover re-print register instead of
 * the sale it belongs to.
 */
export async function applyImportRow(input: {
  row: DispatchSheetRow;
  lookups: RowLookups;
  supabase: Supa;
  factoryId: string;
  createInvoice: (form: FormData) => Promise<ActionResult>;
}): Promise<JobRunItem> {
  const { row, lookups } = input;
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

  const form = invoiceFormData(row, brokerId, markId, lookups);

  const result = await input.createInvoice(form);
  if (!result.ok) return item("failed", result.error);
  return item("imported", result.notice ?? "Invoice created.");
}
