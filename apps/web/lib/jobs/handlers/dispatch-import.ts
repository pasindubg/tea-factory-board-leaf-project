import "server-only";

import { createInvoiceFromOverview, registerOutstandingReprint } from "@/app/dashboard/auction/actions";
import {
  applyImportRow,
  buildRowLookups,
  type DispatchImportPayload,
} from "@/app/dashboard/blm-cloud/auction-data/_actions/import-row";
import type { JobHandler } from "@/lib/jobs/registry";
import type { JobRunItem } from "@/lib/background-jobs";

/**
 * Applies the Dispatch Schedule, a slice at a time.
 *
 * The rows travel on the run's payload rather than being re-read from an
 * upload, because the worker runs in a different invocation minutes later and
 * has no file to read. Parsing already happened once, when the run was queued.
 *
 * Resumable, which is the contract's hard requirement: `cursor.index` is the
 * next row to apply, and every row before it has been. Repeating one would
 * create a duplicate invoice, so the cursor is written after every chunk and
 * the handler never trusts anything else to know where it is.
 *
 * Rows are applied in sheet order and cannot be parallelised: a re-print's
 * chain depends on its earlier lot existing, and broker invoices group by
 * dispatch date.
 */

/** Checking every row would be a database round trip per invoice. */
const CANCEL_CHECK_EVERY = 5;

/** The operator needs a bar that moves, not a write per invoice. */
const PROGRESS_EVERY = 5;

export const runDispatchImportChunk: JobHandler = async ({
  run,
  supabase,
  deadline,
  cancelled,
  reportProgress,
}) => {
  const payload = run.payload as unknown as DispatchImportPayload;
  const rows = payload.rows ?? [];
  const skipped = payload.skipped ?? [];
  const metrics: Record<string, number> = { ...run.metrics };
  const items: JobRunItem[] = [];

  let index = Number((run.cursor as { index?: number }).index ?? 0);

  // Re-read per chunk rather than carried on the payload: a broker or mark
  // registered while the import is running should be picked up, not ignored
  // because the run started before it existed.
  const lookups = await buildRowLookups(supabase, run.factoryId);

  while (index < rows.length) {
    // Checked before the row, not after: a row half-applied at the deadline is
    // the one thing the cursor cannot describe.
    if (Date.now() >= deadline) break;
    if (index % CANCEL_CHECK_EVERY === 0 && (await cancelled())) break;

    const outcome = await applyImportRow({
      row: rows[index],
      lookups,
      cutoverDate: payload.cutoverDate,
      supabase,
      factoryId: run.factoryId,
      createInvoice: createInvoiceFromOverview,
      registerReprint: registerOutstandingReprint,
    });

    items.push(outcome);
    metrics[outcome.status] = (metrics[outcome.status] ?? 0) + 1;
    index += 1;

    // As we go, not only at chunk end, or a one-chunk run never shows a bar.
    if (index % PROGRESS_EVERY === 0) {
      await reportProgress({ cursor: { index }, processedUnits: index, metrics });
    }
  }

  // Attached at the end: showing parser-rejected rows while the run is still
  // queued makes an import that has not begun look like one that skipped all.
  const done = index >= rows.length;

  return {
    cursor: { index },
    processedUnits: index,
    metrics: done ? { ...metrics, skipped: skipped.length } : metrics,
    items: done ? [...items, ...skipped] : items,
    done,
  };
};
