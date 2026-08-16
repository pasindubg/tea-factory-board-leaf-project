"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import {
  carryForwardInvoiceFilters,
  parseDispatchSheet,
  readSheet,
  DISPATCH_SHEET_NAME,
  type DispatchSheetRow,
} from "@tea/api";
import { requireProfile } from "@/lib/profile";
import { friendlyError } from "@/lib/errors";
import type { JobRunItem } from "@/lib/background-jobs";
import { finishJobRun, jobIsRunning, startJobRun, updateJobProgress } from "@/lib/background-jobs-server";
import { createInvoiceFromOverview, markReprint, registerOutstandingReprint } from "@/app/dashboard/auction/actions";
import { formatFourDigitNo, formatSaleNo } from "@/app/dashboard/auction/sale-number";
import { colomboToday } from "@/app/dashboard/auction/_actions/_shared";

/**
 * Go-live import of the factory's own Dispatch Schedule spreadsheet.
 *
 * Every row is applied through the SAME server actions the Invoice Overview
 * page calls — `createInvoiceFromOverview` for an ordinary lot invoice,
 * `registerOutstandingReprint` for a re-print carried over from before the
 * system existed. Nothing here re-implements broker-invoice creation, dispatch
 * bundling, invoice numbering or the re-print chain: the point of the import is
 * to exercise the real logic on real historic data, so any defect in it shows
 * up here rather than being papered over by a bespoke insert path.
 *
 * Consequently the import is only as permissive as manual entry. A row the
 * application would reject on screen is reported with the application's own
 * error message.
 */

/** This job's identity in the background-job framework. */
const JOB_KEY = "auction.dispatch-import" as const;

/** A sheet row's outcome, in the framework's generic item shape: the sheet row
 * number is the ref, the invoice number is the record. */
type ImportRowOutcome = JobRunItem;

export type AuctionImportResult = { ok: true; runId: string } | { ok: false; error: string };

/**
 * Spellings in the book that mean a grade the factory already has. These are
 * registered as aliases so the existing canonicalisation handles them, exactly
 * as it already does for broker documents that spell a grade their own way.
 * Anything NOT listed here is treated as a grade in its own right.
 */
const KNOWN_GRADE_ALIASES: Record<string, string> = {
  PEKOE: "PEKO",
  PEKOE1: "PEKO1",
  "B.M": "BM",
  DUST1: "DUST",
  FBOPFSP: "FBOFSP",
  "OP 1": "OP1",
};

const normalizeSpelling = (value: string) => value.trim().toUpperCase();

/**
 * Makes every grade spelling in the sheet resolvable before a single invoice
 * is written, so no row fails on a grade foreign key mid-import.
 *
 * A spelling that means an existing grade becomes an ALIAS of it; a spelling
 * that means something new becomes an ACTIVE grade, usable on invoices
 * immediately.
 */
async function ensureGrades(
  supabase: Awaited<ReturnType<typeof requireProfile>>["supabase"],
  factoryId: string,
  spellings: string[],
): Promise<{ ok: true; gradesAdded: string[]; aliasesAdded: string[] } | { ok: false; error: string }> {
  const { data: gradeRows, error: gradeError } = await supabase
    .from("auction_grades")
    .select("id, code")
    .eq("factory_id", factoryId);
  if (gradeError) return { ok: false, error: friendlyError(gradeError) };
  const gradeIdByCode = new Map((gradeRows ?? []).map((row) => [normalizeSpelling(row.code as string), row.id as string]));

  const { data: aliasRows, error: aliasError } = await supabase
    .from("auction_grade_aliases")
    .select("alias")
    .eq("factory_id", factoryId);
  if (aliasError) return { ok: false, error: friendlyError(aliasError) };
  const existingAliases = new Set((aliasRows ?? []).map((row) => normalizeSpelling(row.alias as string)));

  const gradesAdded: string[] = [];
  const aliasesAdded: string[] = [];

  for (const spelling of spellings) {
    const key = normalizeSpelling(spelling);
    if (gradeIdByCode.has(key) || existingAliases.has(key)) continue;

    const target = KNOWN_GRADE_ALIASES[key];
    const targetId = target ? gradeIdByCode.get(normalizeSpelling(target)) : undefined;
    if (targetId) {
      const { error } = await supabase
        .from("auction_grade_aliases")
        .insert({ factory_id: factoryId, grade_id: targetId, alias: spelling.trim() });
      if (error) return { ok: false, error: `Could not add grade alias ${spelling}: ${friendlyError(error)}` };
      existingAliases.add(key);
      aliasesAdded.push(`${spelling.trim()} → ${target}`);
      continue;
    }

    // A spelling this factory has never registered. Created ACTIVE so the
    // invoices that use it can be entered, and so it appears in the grade
    // picker for future entry.
    const { data: created, error } = await supabase
      .from("auction_grades")
      .insert({ factory_id: factoryId, code: spelling.trim(), name: spelling.trim(), active: true, sort_order: 900 })
      .select("id, code")
      .maybeSingle();
    if (error) return { ok: false, error: `Could not add grade ${spelling}: ${friendlyError(error)}` };
    if (created) {
      gradeIdByCode.set(normalizeSpelling(created.code as string), created.id as string);
      gradesAdded.push(created.code as string);
    }
  }

  return { ok: true, gradesAdded, aliasesAdded };
}

/** The grade code an invoice row should be entered with — its alias target
 * when it has one, otherwise the spelling itself. */
function gradeForRow(row: DispatchSheetRow): string {
  return KNOWN_GRADE_ALIASES[normalizeSpelling(row.grade)] ?? row.grade.trim();
}

/** Form fields for one ordinary lot invoice, exactly as the Invoice Overview
 * draft row submits them. */
function invoiceFormData(row: DispatchSheetRow, brokerId: string, markId: string, cutoverDate: string): FormData {
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
async function markImportedLotAsReprint(
  supabase: Awaited<ReturnType<typeof requireProfile>>["supabase"],
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

export async function importDispatchSheet(formData: FormData): Promise<AuctionImportResult> {
  const { supabase, profile } = await requireProfile(["owner"]);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose the Dispatch Schedule .xlsx file to upload." };
  }
  if (await jobIsRunning(supabase, profile.factory_id, JOB_KEY)) {
    return { ok: false, error: "An import is already running. Wait for it to finish before starting another." };
  }
  const sheet = readSheet(new Uint8Array(await file.arrayBuffer()), DISPATCH_SHEET_NAME);
  if (!sheet.ok) return { ok: false, error: sheet.error };

  const parsed = parseDispatchSheet(sheet.rows);
  if (parsed.issues.length > 0) return { ok: false, error: parsed.issues.join(" ") };

  const grades = await ensureGrades(supabase, profile.factory_id, parsed.gradeSpellings);
  if (!grades.ok) return { ok: false, error: grades.error };

  // Brokers and marks must already exist — they are configuration, and the
  // reset deliberately preserves them.
  const [{ data: brokerRows }, { data: markRows }] = await Promise.all([
    supabase.from("brokers").select("id, name").eq("factory_id", profile.factory_id),
    supabase.from("marks").select("id, code, name").eq("factory_id", profile.factory_id),
  ]);
  const brokerIdByName = new Map((brokerRows ?? []).map((row) => [normalizeSpelling(row.name as string), row.id as string]));
  const markIdByCode = new Map<string, string>();
  for (const mark of markRows ?? []) {
    markIdByCode.set(normalizeSpelling(mark.code as string), mark.id as string);
    if (mark.name) markIdByCode.set(normalizeSpelling(mark.name as string), mark.id as string);
  }

  const cutoverDate = colomboToday();
  const outcomes: ImportRowOutcome[] = parsed.skipped.map((row) => ({
    ref: String(row.sheetRow),
    label: row.invoiceNo ?? "—",
    status: "skipped",
    detail: row.reason,
  }));

  // Opened BEFORE the first invoice is written. This action keeps running
  // after the tab that started it is refreshed or closed, so progress has to
  // live somewhere any tab can read — see lib/background-jobs-server.ts.
  const notes = [
    ...(grades.aliasesAdded.length > 0 ? [`Grade aliases added: ${grades.aliasesAdded.join(", ")}`] : []),
    ...(grades.gradesAdded.length > 0 ? [`New active grades created: ${grades.gradesAdded.join(", ")}`] : []),
  ];
  const started = await startJobRun(supabase, profile.factory_id, {
    jobKey: JOB_KEY,
    startedBy: profile.id,
    label: file.name,
    totalUnits: parsed.rows.length,
    notes,
  });
  if (!started.ok) return { ok: false, error: started.error };
  const handle = started.handle;

  // Everything from here on runs AFTER the response has been sent.
  //
  // It used to run before it, so the action did not return until the last
  // invoice was written — and since the run id comes back with that return, the
  // page had nothing to poll and nothing to announce until the import was
  // already over. The progress bar appeared at the end, and the toast saying
  // the job had been created arrived after it had finished.
  //
  // after() also detaches the work from the client: the response is complete,
  // so closing the tab or navigating away no longer aborts it. It does not
  // survive the function's own lifetime, which is what the queue and worker are
  // for; this makes the page honest in the meantime.
  after(async () => {
    await applyRows();
  });

  return { ok: true, runId: handle.runId };

  async function applyRows() {
  const count = (status: string) => outcomes.filter((row) => row.status === status).length;
  const tallies = () => ({
    imported: count("imported"),
    reprints: count("reprint"),
    skipped: count("skipped"),
    failed: count("failed"),
  });
  // Written every few rows rather than every row: the operator needs a bar
  // that moves, not a database write per invoice.
  const PROGRESS_EVERY = 5;

  // Applied in sheet order. A re-print's chain depends on its earlier lot
  // existing first, and broker invoices group by dispatch date, so order is
  // part of the behaviour being exercised — these cannot run in parallel.
  let processed = 0;
  for (const row of parsed.rows) {
    processed += 1;
    const brokerId = brokerIdByName.get(normalizeSpelling(row.brokerName));
    const markId = markIdByCode.get(normalizeSpelling(row.markCode));
    const record = (status: string, detail: string) =>
      outcomes.push({ ref: String(row.sheetRow), label: formatFourDigitNo(row.invoiceNo), status, detail });

    if (processed % PROGRESS_EVERY === 0) {
      await updateJobProgress(supabase, profile.factory_id, handle, { processedUnits: processed, metrics: tallies() });
    }
    if (!brokerId) { record("failed", `Broker "${row.brokerName}" is not registered.`); continue; }
    if (!markId) { record("failed", `Selling mark "${row.markCode}" is not registered.`); continue; }

    const form = invoiceFormData(row, brokerId, markId, cutoverDate);

    // Only a re-print the book never dispatched belongs in the cutover
    // register. The book marks a row "Reprint" for BOTH cases: a lot that was
    // dispatched from here, went unsold and was re-printed (an ordinary
    // lifecycle this system models in full), and a lot already sitting at the
    // broker from a sale that predates the book. The dispatch date is what
    // separates them — the second kind has none, because it never left here.
    // Registering the first kind would badge a real dispatch as a cutover
    // entry and hide the sale it actually came from.
    if (row.isReprint && !row.dispatchDate) {
      form.set("target_sale_no", formatSaleNo(row.saleNo ?? ""));
      form.set("sold_sale_no", formatSaleNo(row.nextSaleNo ?? ""));
      form.set("sample_allowance", String(row.sampleWeightKg + row.additionalSampleKg));
      form.set("reason", `Imported from the Dispatch Schedule, sheet row ${row.sheetRow}.`);
      const result = await registerOutstandingReprint(form);
      record(result.ok ? "reprint" : "failed", result.ok ? (result.notice ?? "Registered as an outstanding re-print.") : result.error);
      continue;
    }

    const result = await createInvoiceFromOverview(form);
    if (!result.ok) { record("failed", result.error); continue; }

    // A dispatched lot the book marks as re-printed: created as an ordinary
    // invoice above, then moved through the SAME owner action the Lots list
    // uses, so the sampling deduction and audit entry are identical.
    if (row.isReprint) {
      const marked = await markImportedLotAsReprint(supabase, profile.factory_id, row);
      record(marked.ok ? "reprint" : "failed", marked.ok ? marked.detail : marked.error);
      continue;
    }
    record("imported", result.notice ?? "Invoice created.");
  }

  const sorted = outcomes.sort((a, b) => Number(a.ref) - Number(b.ref));
  await finishJobRun(supabase, profile.factory_id, handle, {
    status: "completed",
    processedUnits: parsed.rows.length,
    metrics: tallies(),
    notes,
    items: sorted,
  });

  revalidatePath("/dashboard/auction");
  revalidatePath("/dashboard/blm-cloud/auction-data");
  }
}
