"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/profile";
import { friendlyError } from "@/lib/errors";

/**
 * Clears the factory's auction TRANSACTION data, leaving its configuration
 * alone. Two uses, both one-off: wiping test data before go-live, and starting
 * again after a bad import.
 *
 * Configuration is deliberately out of scope — brokers, marks, grades,
 * warehouses, invoice prefixes and broker rate cards survive, because an
 * import cannot run without them and re-entering them by hand is exactly the
 * work this is meant to save.
 *
 * The order below is the dependency order. Postgres would cascade some of it,
 * but doing it explicitly means every table is counted and reported rather
 * than silently disappearing inside a cascade the operator cannot see.
 */

/** Tables cleared, most dependent first. `label` is what the operator reads. */
const RESET_TABLES = [
  { table: "vat_ledger", label: "VAT ledger entries" },
  { table: "settlement_charges", label: "Settlement charges" },
  { table: "settlements", label: "Settlements" },
  { table: "sale_lines", label: "Sale lines" },
  { table: "valuations", label: "Valuations" },
  { table: "doc_imports", label: "Uploaded broker documents" },
  { table: "auction_audit", label: "Auction audit history" },
  { table: "lot_invoices", label: "Lot invoice numbers" },
  { table: "auction_lots", label: "Lot invoices" },
  { table: "auction_bundled_dispatch_invoices", label: "Dispatch links" },
  { table: "auction_sales", label: "Dispatch invoices" },
  { table: "auction_bundled_dispatches", label: "Physical dispatches" },
] as const;

export type ResetEntityCount = { table: string; label: string; count: number };

export type AuctionResetPreview = {
  ok: true;
  entities: ResetEntityCount[];
  total: number;
} | { ok: false; error: string };

/** What a reset would delete, so the confirmation names real numbers rather
 * than asking the operator to trust a generic warning. */
export async function previewAuctionReset(): Promise<AuctionResetPreview> {
  const { supabase, profile } = await requireProfile(["owner"]);
  const entities: ResetEntityCount[] = [];
  for (const entity of RESET_TABLES) {
    const { count, error } = await supabase
      .from(entity.table)
      .select("id", { count: "exact", head: true })
      .eq("factory_id", profile.factory_id);
    if (error) return { ok: false, error: `Could not count ${entity.label}: ${friendlyError(error)}` };
    entities.push({ table: entity.table, label: entity.label, count: count ?? 0 });
  }
  return { ok: true, entities, total: entities.reduce((sum, entity) => sum + entity.count, 0) };
}

export type AuctionResetResult =
  | { ok: true; deleted: ResetEntityCount[]; total: number }
  | { ok: false; error: string; deleted: ResetEntityCount[] };

/**
 * Performs the reset. `confirmation` must be typed by the operator — this
 * destroys every auction transaction the factory has recorded, and a single
 * mis-click must not be able to do that.
 */
export async function resetAuctionData(formData: FormData): Promise<AuctionResetResult> {
  const { supabase, profile } = await requireProfile(["owner"]);
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  if (confirmation !== "DELETE") {
    return { ok: false, error: 'Type DELETE to confirm. Nothing was deleted.', deleted: [] };
  }

  const deleted: ResetEntityCount[] = [];
  for (const entity of RESET_TABLES) {
    // Counted before the delete: PostgREST does not return an affected-row
    // count here, and the operator is owed a per-entity report.
    const { count } = await supabase
      .from(entity.table)
      .select("id", { count: "exact", head: true })
      .eq("factory_id", profile.factory_id);
    const { error } = await supabase.from(entity.table).delete().eq("factory_id", profile.factory_id);
    if (error) {
      return {
        ok: false,
        error: `Stopped at ${entity.label}: ${friendlyError(error)}. Everything listed as deleted below is already gone.`,
        deleted,
      };
    }
    deleted.push({ table: entity.table, label: entity.label, count: count ?? 0 });
  }

  revalidatePath("/dashboard/auction");
  revalidatePath("/dashboard/blm-cloud/auction-data");
  return { ok: true, deleted, total: deleted.reduce((sum, entity) => sum + entity.count, 0) };
}
