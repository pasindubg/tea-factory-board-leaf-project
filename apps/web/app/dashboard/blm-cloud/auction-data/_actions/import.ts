"use server";

import { revalidatePath } from "next/cache";
import { parseDispatchSheet, readSheet, DISPATCH_SHEET_NAME, type DispatchSheetRow } from "@tea/api";
import { requireProfile } from "@/lib/profile";
import { friendlyError } from "@/lib/errors";
import type { JobRunItem } from "@/lib/background-jobs";
import { jobIsRunning, startJobRun } from "@/lib/background-jobs-server";
import { runQueuedJobAfterResponse } from "@/lib/jobs/launch";
import {
  KNOWN_GRADE_ALIASES,
  buildRowLookups,
  normalizeSpelling,
  registryGap,
  type DispatchImportPayload,
} from "./import-row";
import { buildCompositeInvoiceNo, invoiceSeqOf } from "@/app/dashboard/auction/invoice-number";
import { gradeMatchKey } from "@/app/dashboard/auction/grade-match";

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
): Promise<{ ok: true; gradesAdded: string[]; aliasesAdded: string[]; unresolvedAliases: string[] } | { ok: false; error: string }> {
  const { data: gradeRows, error: gradeError } = await supabase
    .from("auction_grades")
    .select("id, code")
    .eq("factory_id", factoryId);
  if (gradeError) return { ok: false, error: friendlyError(gradeError) };
  const gradeIdByCode = new Map((gradeRows ?? []).map((row) => [normalizeSpelling(row.code as string), row.id as string]));
  // The same grades again, keyed so a spelling that differs only in case,
  // spacing, punctuation or an I-for-1 slip still finds the one already there.
  const gradeByMatchKey = new Map<string, { id: string; code: string }>();
  for (const row of gradeRows ?? []) {
    const code = row.code as string;
    if (!gradeByMatchKey.has(gradeMatchKey(code))) gradeByMatchKey.set(gradeMatchKey(code), { id: row.id as string, code });
  }

  const { data: aliasRows, error: aliasError } = await supabase
    .from("auction_grade_aliases")
    .select("alias")
    .eq("factory_id", factoryId);
  if (aliasError) return { ok: false, error: friendlyError(aliasError) };
  const existingAliases = new Set((aliasRows ?? []).map((row) => normalizeSpelling(row.alias as string)));

  const gradesAdded: string[] = [];
  const aliasesAdded: string[] = [];
  const unresolvedAliases: string[] = [];

  for (const spelling of spellings) {
    const key = normalizeSpelling(spelling);
    if (gradeIdByCode.has(key) || existingAliases.has(key)) continue;

    // Two ways a spelling can mean a grade the factory already has: this
    // book's own vocabulary (FBOPFSP means FBOFSP — nothing mechanical about
    // it), or the same code written differently. Named aliases win, because
    // they encode a fact the folding cannot know.
    const named = KNOWN_GRADE_ALIASES[key];
    const namedId = named ? gradeIdByCode.get(normalizeSpelling(named)) : undefined;
    const mechanical = namedId ? undefined : gradeByMatchKey.get(gradeMatchKey(spelling));
    const targetId = namedId ?? mechanical?.id;
    const target = namedId ? named : mechanical?.code;
    if (targetId && target) {
      const { error } = await supabase
        .from("auction_grade_aliases")
        .insert({ factory_id: factoryId, grade_id: targetId, alias: spelling.trim() });
      if (error) return { ok: false, error: `Could not add grade alias ${spelling}: ${friendlyError(error)}` };
      existingAliases.add(key);
      aliasesAdded.push(`${spelling.trim()} → ${target}`);
      continue;
    }
    // A named alias whose target this factory does not actually have. Saying
    // so beats silently registering the spelling as a grade in its own right
    // and leaving the operator to wonder why the alias never applied.
    if (named && !namedId) unresolvedAliases.push(`${spelling.trim()} → ${named}`);

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
      const code = created.code as string;
      gradeIdByCode.set(normalizeSpelling(code), created.id as string);
      // Registered under BOTH keys, so a second variant later in the same
      // sheet aliases to this one instead of creating a third spelling.
      if (!gradeByMatchKey.has(gradeMatchKey(code))) gradeByMatchKey.set(gradeMatchKey(code), { id: created.id as string, code });
      gradesAdded.push(code);
    }
  }

  return { ok: true, gradesAdded, aliasesAdded, unresolvedAliases };
}

/**
 * The sheet's invoice numbers this factory already holds.
 *
 * Every row is created afresh, so importing a book a second time without
 * clearing the first run fails on a duplicate invoice number — once per row,
 * 258 lines all saying the same thing. The collision is knowable before the
 * run starts, and naming it sends the operator to Stage 1 instead.
 *
 * Compared as COMPOSITES. A stored number carries its prefix ("26I01-0941")
 * and formatFourDigitNo keeps that prefix — it only pads trailing digits — so
 * matching it against the book's bare "941" finds nothing and lets the whole
 * duplicate run through. Each row will be written under the active
 * regular-invoice prefix, so that is what the sheet's numbers are composed
 * with here.
 */
async function alreadyHeldInvoiceNos(
  supabase: Awaited<ReturnType<typeof requireProfile>>["supabase"],
  factoryId: string,
  rows: DispatchSheetRow[],
  activePrefix: string,
): Promise<{ ok: true; clashes: string[] } | { ok: false; error: string }> {
  const { data, error } = await supabase.from("lot_invoices").select("invoice_no").eq("factory_id", factoryId);
  if (error) return { ok: false, error: friendlyError(error) };
  const held = new Set((data ?? []).map((row) => String(row.invoice_no ?? "").trim()));
  const wanted = rows.map((row) => buildCompositeInvoiceNo(activePrefix, invoiceSeqOf(row.invoiceNo)));
  return { ok: true, clashes: wanted.filter((no) => held.has(no)) };
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

  // Checked BEFORE any grade is written: brokers, marks and number prefixes are
  // configuration the import cannot create, so a gap in any of them fails every
  // row alike. Refusing the upload leaves the factory exactly as it was.
  const lookups = await buildRowLookups(supabase, profile.factory_id);
  const gap = registryGap(parsed.rows, lookups);
  if (gap) return { ok: false, error: gap };

  const held = await alreadyHeldInvoiceNos(
    supabase,
    profile.factory_id,
    parsed.rows,
    lookups.activePrefixByCategory.get("regular_invoice") ?? "",
  );
  if (!held.ok) return { ok: false, error: held.error };
  if (held.clashes.length > 0) {
    return {
      ok: false,
      error: `${held.clashes.length} of this sheet's ${parsed.rows.length} invoice numbers are already in this factory (${held.clashes.slice(0, 5).join(", ")}${held.clashes.length > 5 ? ", …" : ""}) — an earlier import was not cleared. Run Stage 1 reset first, then import.`,
    };
  }

  const grades = await ensureGrades(supabase, profile.factory_id, parsed.gradeSpellings);
  if (!grades.ok) return { ok: false, error: grades.error };

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
    ...(grades.unresolvedAliases.length > 0
      ? [`Known aliases whose target grade this factory does not have, so the spelling was registered as a grade of its own: ${grades.unresolvedAliases.join(", ")}`]
      : []),
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
    payload: { rows: parsed.rows, skipped: outcomes } satisfies DispatchImportPayload,
  });
  if (!started.ok) return { ok: false, error: started.error };

  await runQueuedJobAfterResponse();

  return { ok: true, runId: started.handle.runId };
}
