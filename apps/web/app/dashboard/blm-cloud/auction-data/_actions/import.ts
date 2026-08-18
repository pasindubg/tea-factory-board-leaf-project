"use server";

import { revalidatePath } from "next/cache";
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
import { jobIsRunning, startJobRun } from "@/lib/background-jobs-server";
import { triggerJobTick } from "@/lib/jobs/trigger";
import { KNOWN_GRADE_ALIASES, normalizeSpelling, type DispatchImportPayload } from "./import-row";
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
    // Skipped rows travel on the payload, not seeded onto the run: "Skipped:
    // 112" over a 0% bar reads as an import that ran and rejected everything.
    // Self-contained on purpose — the worker has no upload to go back to.
    payload: { rows: parsed.rows, cutoverDate, skipped: outcomes } satisfies DispatchImportPayload,
  });
  if (!started.ok) return { ok: false, error: started.error };

  // Applied by the worker, one chunk per invocation, resuming from a cursor —
  // which is what survives a closed tab, a sign-out and a deploy.
  void triggerJobTick();

  return { ok: true, runId: started.handle.runId };
}
