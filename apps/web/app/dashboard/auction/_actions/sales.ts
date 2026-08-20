"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireModuleAccess, requireModuleRole, requireProfile } from "@/lib/profile";
import { deleteTenantRow } from "@/lib/tenant-data";
import { friendlyDeleteError, friendlyError } from "@/lib/errors";
import type { ListMutationResult } from "@/lib/list-mutations";
import { AUC, str, num, back, nextDispatchNo, saleDetailPath, stageImport, writeAudit, gradeRulesByCode, isRecordId, notAnExisting, unsoldBlockedReason } from "./_shared";
import { formatFourDigitNo, formatSaleNo, saleNoMatches } from "../sale-number";
import { isOpenDraft } from "../state-buckets";
import { resolveInvoicePrefix } from "../invoice-number";
import { syncDispatchForBrokerInvoice } from "./bundled-dispatches";

async function nextBundledDispatchNo(supabase: Awaited<ReturnType<typeof requireModuleAccess>>["supabase"]) {
  const { data } = await supabase.from("auction_bundled_dispatches").select("dispatch_no");
  const maximum = (data ?? []).reduce((max, row) => {
    const suffix = String(row.dispatch_no ?? "").match(/\d+$/)?.[0];
    return suffix ? Math.max(max, Number(suffix)) : max;
  }, 0);
  return formatFourDigitNo(maximum + 1);
}

/** Creates one physical bundle for a factory calendar day, or returns the existing one. */
async function ensureDailyBundledDispatch(
  supabase: Awaited<ReturnType<typeof requireModuleAccess>>["supabase"],
  factoryId: string,
  dispatchDate: string,
) {
  const findExisting = () => supabase
    .from("auction_bundled_dispatches")
    .select("id")
    .eq("factory_id", factoryId)
    .eq("auto_created", true)
    .eq("dispatch_date_from", dispatchDate)
    .eq("dispatch_date_to", dispatchDate)
    .maybeSingle();
  const { data: existing } = await findExisting();
  if (existing?.id) return existing.id as string;

  const { data: warehouses } = await supabase
    .from("auction_warehouses")
    .select("name")
    .eq("factory_id", factoryId)
    .eq("active", true)
    .order("name");
  const warehouseRows = (warehouses ?? []) as { name: string }[];
  const warehouse = warehouseRows.find((row) => row.name.toLowerCase() === "main warehouse") ?? warehouseRows[0];
  if (!warehouse) throw new Error("Add an active warehouse before creating a Broker Invoice.");

  const dispatchNo = await nextBundledDispatchNo(supabase);
  const { data: created, error } = await supabase
    .from("auction_bundled_dispatches")
    .insert({
      factory_id: factoryId,
      dispatch_no: dispatchNo,
      dispatch_date: dispatchDate,
      dispatch_date_from: dispatchDate,
      dispatch_date_to: dispatchDate,
      warehouse: warehouse.name,
      auto_created: true,
      status: "draft",
    })
    .select("id")
    .single();
  if (created?.id) return created.id as string;

  // The partial unique index makes simultaneous first invoices safe: the loser
  // simply reads the dispatch created by the other request.
  if (error?.code === "23505") {
    const { data: concurrent } = await findExisting();
    if (concurrent?.id) return concurrent.id as string;
  }
  throw new Error(error?.message ?? "Could not create the bundled dispatch.");
}

type OpenDraftInvoice = { id: string; sale_no: string; dispatch_date: string | null };

/**
 * Which screen a Broker Invoice is being opened from. Ordinary dispatch entry
 * is `invoice`; `reprint-register` is the Re-prints page entering a re-print
 * the factory already had outstanding before it started using this system.
 */
export type BrokerInvoiceEntrySource = "invoice" | "reprint-register";

/**
 * There must be one and only one open Broker Invoice for a broker + selling
 * mark ON A GIVEN DISPATCH DATE. A later dispatch day is separate work and
 * gets its own invoice, so the date is part of the key — mirroring the
 * uq_auction_sales_open_broker_mark index that backs this check.
 *
 * `entry_source` is part of that key too, so a cutover re-print entry gets its
 * own open invoice rather than joining an open dispatch for the same broker,
 * mark and date — which would file un-dispatched re-prints inside a real
 * physical dispatch.
 *
 * A null dispatch date can never collide (Postgres treats nulls as distinct in
 * a unique index), so it short-circuits rather than matching other null-dated
 * rows and reporting a conflict the database would happily accept.
 */
async function findOpenDraftInvoice(
  supabase: Awaited<ReturnType<typeof requireModuleAccess>>["supabase"],
  factoryId: string,
  brokerId: string,
  sellingMarkId: string,
  dispatchDate: string | null,
  entrySource: BrokerInvoiceEntrySource,
  excludingId?: string,
): Promise<OpenDraftInvoice | null> {
  if (!dispatchDate) return null;
  let query = supabase
    .from("auction_sales")
    .select("id, sale_no, dispatch_date")
    .eq("factory_id", factoryId)
    .eq("broker_id", brokerId)
    .eq("selling_mark_id", sellingMarkId)
    .eq("dispatch_date", dispatchDate)
    .eq("sale_kind", "dispatch")
    .eq("entry_source", entrySource)
    .in("status", ["draft", "dispatched"])
    .order("created_at", { ascending: true })
    .limit(1);
  if (excludingId) query = query.neq("id", excludingId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data?.[0] as OpenDraftInvoice | undefined) ?? null;
}

function duplicateDraftInvoiceError(invoice: OpenDraftInvoice) {
  const invoiceNo = formatFourDigitNo(invoice.sale_no) || invoice.sale_no;
  const date = invoice.dispatch_date ? ` on ${invoice.dispatch_date}` : "";
  return `Broker Invoice ${invoiceNo} is already open for this broker and selling mark${date}. Confirm, delete, or reuse it, or use a different dispatch date.`;
}

// ---------- Broker invoices ----------
const DISPATCH_PAYLOAD_FIELDS = [
  "broker_id", "target_sale_no", "sale_date", "dispatch_date",
  "selling_mark_id", "broker_lorry_no", "driver_name", "transporter",
] as const;

type InsertDispatchResult =
  | { ok: true; id: string }
  | { ok: true; pending: true }
  | { ok: false; error: string };

async function insertDispatch(
  formData: FormData,
  options: { bypassPrefixId?: string; entrySource?: BrokerInvoiceEntrySource } = {},
): Promise<InsertDispatchResult> {
  const { supabase, profile } = await requireModuleAccess("auction");
  const entrySource: BrokerInvoiceEntrySource = options.entrySource ?? "invoice";
  const brokerId = str(formData.get("broker_id"));

  let saleNoPrefix: string;
  if (options.bypassPrefixId) {
    const { data: prefixRow, error: prefixError } = await supabase
      .from("invoice_number_prefixes")
      .select("prefix")
      .eq("id", options.bypassPrefixId)
      .eq("factory_id", profile.factory_id)
      .maybeSingle();
    if (prefixError) return { ok: false, error: friendlyError(prefixError) };
    if (!prefixRow) return { ok: false, error: "Unknown invoice number prefix." };
    saleNoPrefix = prefixRow.prefix as string;
  } else {
    const requestedPrefixId = str(formData.get("prefix_id")) || undefined;
    const prefixResult = await resolveInvoicePrefix({
      supabase, factoryId: profile.factory_id, category: "broker_invoice", role: profile.role, requestedPrefixId,
    });
    if (!prefixResult.ok) return { ok: false, error: prefixResult.error };
    if (prefixResult.needsApproval) {
      const payload = Object.fromEntries(DISPATCH_PAYLOAD_FIELDS.map((field) => [field, str(formData.get(field))]));
      const { error: exceptionError } = await supabase.from("invoice_prefix_exceptions").insert({
        factory_id: profile.factory_id,
        category: "broker_invoice",
        requested_prefix_id: prefixResult.prefix.id,
        context_id: null,
        payload,
        requested_by: profile.id,
      });
      if (exceptionError) return { ok: false, error: friendlyError(exceptionError) };
      return { ok: true, pending: true };
    }
    saleNoPrefix = prefixResult.prefix.prefix;
  }
  const saleNo = await nextDispatchNo(supabase, profile.factory_id, saleNoPrefix);
  const targetSaleNo = formatSaleNo(str(formData.get("target_sale_no")));
  const saleDate = str(formData.get("sale_date"));
  const dispatchDate = str(formData.get("dispatch_date"));
  const sellingMarkId = str(formData.get("selling_mark_id"));
  const brokerLorryNo = str(formData.get("broker_lorry_no"));
  const driverName = str(formData.get("driver_name"));
  const transporter = str(formData.get("transporter"));
  if (!brokerId) return { ok: false, error: "Pick a broker." };
  if (!targetSaleNo) return { ok: false, error: "Sale number is required." };
  if (!saleDate) return { ok: false, error: "Sale date is required." };
  if (!dispatchDate) return { ok: false, error: "Dispatch date is required." };
  if (!sellingMarkId) return { ok: false, error: "Pick a selling mark." };
  // Typed-but-not-picked text must be rejected BEFORE it reaches a uuid
  // column, or Postgres fails it as unreadable 22P02 syntax instead.
  if (!isRecordId(brokerId)) return { ok: false, error: notAnExisting(brokerId, "broker") };
  if (!isRecordId(sellingMarkId)) return { ok: false, error: notAnExisting(sellingMarkId, "selling mark") };
  const [{ data: broker }, { data: mark }] = await Promise.all([
    supabase.from("brokers").select("id").eq("id", brokerId).eq("factory_id", profile.factory_id).maybeSingle(),
    supabase.from("marks").select("id").eq("id", sellingMarkId).eq("factory_id", profile.factory_id).maybeSingle(),
  ]);
  if (!broker) return { ok: false, error: notAnExisting(brokerId, "broker") };
  if (!mark) return { ok: false, error: notAnExisting(sellingMarkId, "selling mark") };
  try {
    const existingDraft = await findOpenDraftInvoice(supabase, profile.factory_id, brokerId, sellingMarkId, dispatchDate, entrySource);
    if (existingDraft) return { ok: false, error: duplicateDraftInvoiceError(existingDraft) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not check existing Broker Invoices." };
  }
  // A bundled dispatch is the PHYSICAL movement of tea to the broker. A
  // cutover re-print was never dispatched from here — it is already sitting at
  // the broker — so it gets no bundle. Without this it is filed inside a real
  // dispatch (or conjures one of its own), which makes the dispatch record
  // claim a lorry left that never did.
  const needsBundle = entrySource !== "reprint-register";
  let bundleId = "";
  if (needsBundle) {
    try {
      bundleId = await ensureDailyBundledDispatch(supabase, profile.factory_id, dispatchDate);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Could not create the bundled dispatch." };
    }
    if (!bundleId) return { ok: false, error: "Could not create the bundled dispatch." };
  }
  const { data, error } = await supabase
    .from("auction_sales")
    .insert({
      factory_id: profile.factory_id,
      broker_id: brokerId,
      sale_no: saleNo,
      sale_date: saleDate,
      target_sale_no: targetSaleNo,
      dispatch_date: dispatchDate,
      selling_mark_id: sellingMarkId,
      broker_lorry_no: brokerLorryNo || null,
      driver_name: driverName || null,
      transporter: transporter || null,
      bundled_dispatch_id: bundleId || null,
      entry_source: entrySource,
      status: "draft",
    })
    .select("id")
    .single();
  if (error?.code === "23505") return { ok: false, error: "This broker and selling mark already have an open Broker Invoice on this dispatch date. Refresh the list and reuse or finish that draft, or use a different dispatch date." };
  if (error || !data) return { ok: false, error: friendlyError(error ?? { message: "Could not create the broker invoice." }) };
  const { error: linkError } = bundleId
    ? await supabase.from("auction_bundled_dispatch_invoices").insert({
        factory_id: profile.factory_id,
        bundled_dispatch_id: bundleId,
        broker_invoice_id: data.id,
      })
    : { error: null };
  if (linkError) {
    const rollback = await deleteTenantRow(supabase, "auction_sales", data.id as string);
    if (rollback.error) {
      return {
        ok: false,
        error: "The Broker Invoice could not be linked, and its temporary record could not be cleaned up. Refresh and review the invoice list before retrying.",
      };
    }
    return { ok: false, error: friendlyError(linkError) };
  }
  revalidatePath(AUC);
  revalidatePath(`${AUC}/dispatches`);
  revalidatePath(`${AUC}/dispatches/details`);
  return { ok: true, id: data.id as string };
}

export async function createSale(formData: FormData): Promise<ListMutationResult> {
  const result = await insertDispatch(formData);
  if (!result.ok) return result;
  if ("pending" in result) return { ok: true, notice: "Sent for supervisor approval — this prefix isn't the active one." };
  return { ok: true, notice: "Broker invoice created." };
}

export async function createSaleWithId(formData: FormData): Promise<
  ListMutationResult & { id?: string }
> {
  const result = await insertDispatch(formData);
  if (!result.ok) return result;
  if ("pending" in result) return { ok: true, notice: "Sent for supervisor approval — this prefix isn't the active one." };
  return { ok: true, id: result.id, notice: "Broker invoice created." };
}

export { createSale as createDispatch };
export { createSaleWithId as createDispatchWithId };

export type ResolvedBrokerInvoice =
  | { ok: true; saleId: string; created: boolean }
  | { ok: true; pending: true }
  | { ok: false; error: string };

/**
 * The broker invoice a lot invoice belongs to, given its broker, selling mark
 * and dispatch date. Used by the Invoice Overview page so a lot invoice can be
 * added without first navigating to its broker invoice.
 *
 * The grouping rule is deliberately not re-implemented here: it reuses the
 * same findOpenDraftInvoice lookup that governs direct broker invoice
 * creation, and when nothing is open it creates the invoice through
 * insertDispatch itself — so numbering, prefix resolution and the
 * one-open-invoice-per broker+mark+dispatch-date rule stay identical whichever
 * page the user starts from.
 */
export async function resolveBrokerInvoiceForLot(
  formData: FormData,
  options: { entrySource?: BrokerInvoiceEntrySource } = {},
): Promise<ResolvedBrokerInvoice> {
  const { supabase, profile } = await requireModuleAccess("auction");
  const entrySource: BrokerInvoiceEntrySource = options.entrySource ?? "invoice";
  const brokerId = str(formData.get("broker_id"));
  const sellingMarkId = str(formData.get("selling_mark_id"));
  const dispatchDate = str(formData.get("dispatch_date"));
  if (!brokerId) return { ok: false, error: "Pick a broker." };
  if (!sellingMarkId) return { ok: false, error: "Pick a selling mark." };
  if (!dispatchDate) return { ok: false, error: "Dispatch date is required." };
  // This runs before insertDispatch's own checks, and findOpenDraftInvoice
  // below filters uuid columns by these values — so free text has to be caught
  // here too, or it surfaces as a raw driver message rather than this one.
  if (!isRecordId(brokerId)) return { ok: false, error: notAnExisting(brokerId, "broker") };
  if (!isRecordId(sellingMarkId)) return { ok: false, error: notAnExisting(sellingMarkId, "selling mark") };

  try {
    const existing = await findOpenDraftInvoice(supabase, profile.factory_id, brokerId, sellingMarkId, dispatchDate, entrySource);
    if (existing) return { ok: true, saleId: existing.id, created: false };
  } catch (error) {
    // Never surface the driver's own text: it leaks column and type names.
    return { ok: false, error: friendlyError(error) };
  }

  const created = await insertDispatch(formData, { entrySource });
  if (!created.ok) return created;
  if ("pending" in created) return { ok: true, pending: true };
  return { ok: true, saleId: created.id, created: true };
}

/** Replays a broker-invoice creation from an approved invoice_prefix_exceptions row. */
export async function createDispatchFromApprovedException(
  payload: Record<string, unknown>,
  requestedPrefixId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const formData = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    if (value != null) formData.set(key, String(value));
  }
  const result = await insertDispatch(formData, { bypassPrefixId: requestedPrefixId });
  if (!result.ok) return result;
  if ("pending" in result) return { ok: false, error: "Unexpected pending state while replaying an approved broker invoice." };
  return result;
}

export async function deleteSale(id: string): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleAccess("auction");
  // Preserve the entity-specific role and tenant guard. PostgreSQL then owns
  // the atomic relationship behavior: operational lots/configuration cascade,
  // while sale proceeds, VAT and settlements reject deletion with a readable
  // dependent-record error.
  const { data: sale } = await supabase
    .from("auction_sales").select("id, status").eq("id", id).eq("factory_id", profile.factory_id).maybeSingle();
  if (!sale) return { ok: false, error: "Broker invoice not found." };
  // The owner may delete at any point in the lifecycle; everyone else only
  // while it is still an unconfirmed draft.
  if (profile.role !== "owner" && !isOpenDraft(sale.status as string | null)) {
    return { ok: false, error: "This broker invoice has been confirmed — only the owner can delete it now." };
  }
  const { error: deleteError } = await deleteTenantRow(supabase, "auction_sales", id);
  if (deleteError) return { ok: false, error: deleteError };
  revalidatePath(AUC);
  return { ok: true, notice: "Broker invoice deleted." };
}

/**
 * Owner-only. A "sale" is a virtual grouping of broker invoices by
 * target_sale_no (see auction.sales-side-list) — deleting one deletes every
 * broker invoice assigned to it, which cascades to their lots/lot_invoices
 * at the DB level exactly like a single deleteSale call.
 *
 * sale_lines, vat_ledger, and settlements are declared restrictive in the
 * schema so an accidental single-invoice or single-lot delete can never
 * silently destroy financial history. Deleting a whole sale is the one
 * deliberate exception: this removes that owned financial subtree first,
 * innermost dependency outwards, so the invoice deletes below succeed.
 * The FKs stay restrictive for every other delete path.
 */
export async function deleteAuctionSaleGroup(saleNo: string): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleRole("auction", ["owner"]);
  const [{ data: dispatches, error: dispatchError }, { data: lots, error: lotError }] = await Promise.all([
    supabase
      .from("auction_sales")
      .select("id, sale_no, target_sale_no")
      .eq("factory_id", profile.factory_id)
      .eq("sale_kind", "dispatch"),
    supabase
      .from("auction_lots")
      .select("sale_id, provisional_sale_no, final_sale_no")
      .eq("factory_id", profile.factory_id),
  ]);
  if (dispatchError || lotError) return { ok: false, error: friendlyError(dispatchError ?? lotError) };

  const dispatchIds = new Set(
    (dispatches ?? [])
      // sale_no is an identity fallback only for dispatches with no target —
      // otherwise deleting sale 20 would take broker invoice 0020 (sale 22) with it.
      .filter((dispatch) => saleNoMatches(dispatch.target_sale_no as string | null, saleNo) || (!dispatch.target_sale_no && saleNoMatches(dispatch.sale_no as string, saleNo)))
      .map((dispatch) => dispatch.id as string),
  );
  for (const lot of (lots ?? []) as { sale_id: string; provisional_sale_no: string | null; final_sale_no: string | null }[]) {
    if (saleNoMatches(lot.final_sale_no || lot.provisional_sale_no, saleNo)) dispatchIds.add(lot.sale_id);
  }
  if (dispatchIds.size === 0) return { ok: false, error: "Sale not found." };
  const invoiceIds = [...dispatchIds];

  // A sale line is normally reachable by its own sale_id, but it also carries a
  // restrictive lot_id — so collect both ways, or a stray line would block its
  // lot from cascading away with the invoice below.
  const { data: lotIdRows, error: lotIdError } = await supabase
    .from("auction_lots")
    .select("id")
    .in("sale_id", invoiceIds);
  if (lotIdError) return { ok: false, error: friendlyError(lotIdError) };
  const lotIds = (lotIdRows ?? []).map((row) => row.id as string);

  const [{ data: linesBySale, error: linesBySaleError }, { data: linesByLot, error: linesByLotError }] = await Promise.all([
    supabase.from("sale_lines").select("id").in("sale_id", invoiceIds),
    lotIds.length > 0
      ? supabase.from("sale_lines").select("id").in("lot_id", lotIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (linesBySaleError || linesByLotError) return { ok: false, error: friendlyError(linesBySaleError ?? linesByLotError) };
  const saleLineIds = [...new Set([...(linesBySale ?? []), ...(linesByLot ?? [])].map((row) => row.id as string))];

  if (saleLineIds.length > 0) {
    const { error: vatError } = await supabase.from("vat_ledger").delete().in("sale_line_id", saleLineIds);
    if (vatError) return { ok: false, error: friendlyDeleteError(vatError) };
    const { error: saleLineError } = await supabase.from("sale_lines").delete().in("id", saleLineIds);
    if (saleLineError) return { ok: false, error: friendlyDeleteError(saleLineError) };
  }
  // settlement_charges cascade with their settlement; matched bank_txns are
  // only unlinked (ON DELETE SET NULL), so bank history itself survives.
  const { error: settlementError } = await supabase.from("settlements").delete().in("sale_id", invoiceIds);
  if (settlementError) return { ok: false, error: friendlyDeleteError(settlementError) };

  let succeeded = 0;
  const failures: string[] = [];
  for (const id of dispatchIds) {
    const { error: deleteError } = await deleteTenantRow(supabase, "auction_sales", id);
    if (deleteError) failures.push(deleteError);
    else succeeded += 1;
  }
  if (succeeded === 0) {
    return { ok: false, error: failures[0] ?? "No broker invoices were deleted." };
  }
  revalidatePath(AUC);
  return {
    ok: true,
    notice: `Sale ${formatSaleNo(saleNo)} deleted (${succeeded} broker invoice${succeeded === 1 ? "" : "s"})${failures.length ? `; ${failures.length} could not be deleted` : ""}.`,
  };
}

export async function updateSale(id: string, formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleAccess("auction");
  // Fetched once up front: the owner may edit at any point in the lifecycle,
  // everyone else only while the invoice is still an unconfirmed draft. The
  // selling-mark branch below reuses this row rather than re-reading it.
  const { data: currentSale, error: currentSaleError } = await supabase
    .from("auction_sales")
    .select("id, broker_id, sale_kind, status, dispatch_date, entry_source")
    .eq("id", id)
    .eq("factory_id", profile.factory_id)
    .maybeSingle();
  if (currentSaleError) return { ok: false, error: friendlyError(currentSaleError) };
  if (!currentSale) return { ok: false, error: "Broker invoice not found." };
  if (profile.role !== "owner" && !isOpenDraft(currentSale.status as string | null)) {
    return { ok: false, error: "This broker invoice has been confirmed — only the owner can edit it now." };
  }

  const updates: Record<string, string | null> = {};
  const target = formatSaleNo(str(formData.get("target_sale_no")));
  const saleDate = str(formData.get("sale_date"));
  const promptDate = str(formData.get("prompt_date"));
  if (formData.has("target_sale_no")) updates.target_sale_no = target || null;
  if (formData.has("sale_date")) updates.sale_date = saleDate || null;
  if (formData.has("prompt_date")) updates.prompt_date = promptDate || null;
  if (formData.has("selling_mark_id")) {
    const sellingMarkId = str(formData.get("selling_mark_id"));
    if (!sellingMarkId) return { ok: false, error: "Selling mark is required." };
    if (!isRecordId(sellingMarkId)) return { ok: false, error: notAnExisting(sellingMarkId, "selling mark") };
    const { data: mark, error: markError } = await supabase
      .from("marks")
      .select("id")
      .eq("id", sellingMarkId)
      .eq("factory_id", profile.factory_id)
      .maybeSingle();
    if (markError) return { ok: false, error: friendlyError(markError) };
    if (!mark) return { ok: false, error: notAnExisting(sellingMarkId, "selling mark") };
    if (currentSale.sale_kind === "dispatch" && isOpenDraft(currentSale.status as string | null)) {
      try {
        const existingDraft = await findOpenDraftInvoice(
          supabase,
          profile.factory_id,
          currentSale.broker_id as string,
          sellingMarkId,
          (currentSale as { dispatch_date?: string | null }).dispatch_date ?? null,
          ((currentSale as { entry_source?: string | null }).entry_source as BrokerInvoiceEntrySource | null) ?? "invoice",
          id,
        );
        if (existingDraft) return { ok: false, error: duplicateDraftInvoiceError(existingDraft) };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Could not check existing Broker Invoices." };
      }
    }
    updates.selling_mark_id = sellingMarkId;
  }
  if (formData.has("broker_lorry_no")) {
    const brokerLorryNo = str(formData.get("broker_lorry_no"));
    updates.broker_lorry_no = brokerLorryNo || null;
  }
  if (formData.has("driver_name")) {
    const driverName = str(formData.get("driver_name"));
    updates.driver_name = driverName || null;
  }
  if (formData.has("transporter")) {
    const transporter = str(formData.get("transporter"));
    updates.transporter = transporter || null;
  }
  if (Object.keys(updates).length > 0) {
    const { data: updatedSale, error } = await supabase
      .from("auction_sales")
      .update(updates)
      .eq("id", id)
      .eq("factory_id", profile.factory_id)
      .select("id")
      .maybeSingle();
    if (error?.code === "23505") return { ok: false, error: "This broker and selling mark already have an open Broker Invoice on this dispatch date. Refresh the list and reuse or finish that draft before saving." };
    if (error) return { ok: false, error: friendlyError(error) };
    if (!updatedSale) return { ok: false, error: "This broker invoice was not found or changed before it could be updated." };
    if (updates.target_sale_no) {
      const { error: lotUpdateError } = await supabase
        .from("auction_lots")
        .update({ provisional_sale_no: updates.target_sale_no })
        .eq("sale_id", id)
        .eq("factory_id", profile.factory_id)
        .is("final_sale_no", null);
      if (lotUpdateError) return { ok: false, error: friendlyError(lotUpdateError) };
    }
  }
  revalidatePath(AUC);
  revalidatePath(`${AUC}/${id}`);
  return { ok: true, notice: "Broker invoice updated." };
}

export async function confirmDispatchDraft(id: string): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleAccess("auction");
  const { data: confirmed, error } = await supabase
    .from("auction_sales")
    .update({ status: "invoiced" })
    .eq("id", id)
    .eq("factory_id", profile.factory_id)
    .in("status", ["draft", "dispatched"])
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: friendlyError(error) };
  if (!confirmed) return { ok: false, error: "This broker invoice was not found or is no longer a draft." };
  // The dispatch holding this invoice may now qualify for a later stage.
  await syncDispatchForBrokerInvoice(supabase, id, profile.factory_id);
  revalidatePath(AUC);
  revalidatePath(`${AUC}/${id}`);
  return { ok: true, notice: "Broker invoice confirmed." };
}

export async function completeGrn(id: string, formData: FormData) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const detail = `${AUC}/${id}`;
  const { data: invoice, error: invoiceError } = await supabase
    .from("auction_sales")
    .select("id, status")
    .eq("id", id)
    .eq("factory_id", profile.factory_id)
    .maybeSingle();
  if (invoiceError) back(detail, friendlyError(invoiceError));
  if (!invoice) back(detail, "Broker Invoice not found.");
  if (!["invoiced", "grn"].includes(invoice?.status as string)) {
    back(detail, "Confirm the Broker Invoice before proceeding to GRN.");
  }

  const entry = formData.get("grn_file");
  let uploaded = false;
  if (entry instanceof File && entry.size > 0) {
    const allowed = entry.type === "application/pdf" || entry.type.startsWith("image/");
    if (!allowed) back(detail, "GRN must be an image or PDF.");
    const safeName = entry.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
    const storagePath = `${profile.factory_id}/${id}/grn/${randomUUID()}-${safeName}`;
    const bytes = new Uint8Array(await entry.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from("auction-documents")
      .upload(storagePath, bytes, { contentType: entry.type || "application/octet-stream", upsert: false });
    if (uploadError) back(detail, `Could not upload GRN: ${uploadError.message}`);
    const staged = await stageImport(
      supabase,
      profile.factory_id,
      id,
      "grn",
      entry,
      { parserStatus: "pending", mimeType: entry.type, size: entry.size },
      storagePath,
    );
    if (!staged.ok) {
      await supabase.storage.from("auction-documents").remove([storagePath]);
      return back(detail, staged.error);
    }
    const { data: confirmedImport, error: confirmImportError } = await supabase
      .from("doc_imports")
      .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
      .eq("id", staged.importId)
      .eq("factory_id", profile.factory_id)
      .eq("sale_id", id)
      .select("id")
      .maybeSingle();
    if (confirmImportError || !confirmedImport) {
      await supabase.storage.from("auction-documents").remove([storagePath]);
      back(detail, confirmImportError ? friendlyError(confirmImportError) : "Could not confirm the uploaded GRN record.");
    }
    uploaded = true;
  }

  const { data: grnInvoice, error: grnError } = await supabase
    .from("auction_sales")
    .update({ status: "grn" })
    .eq("id", id)
    .eq("factory_id", profile.factory_id)
    .in("status", ["invoiced", "grn"])
    .select("id")
    .maybeSingle();
  if (grnError || !grnInvoice) back(detail, grnError ? friendlyError(grnError) : "This broker invoice changed before GRN could be completed.");
  // Every invoice reaching GRN is what moves its dispatch to "received".
  await syncDispatchForBrokerInvoice(supabase, id, profile.factory_id);
  revalidatePath(AUC);
  revalidatePath(detail);
  redirect(`${detail}?notice=${encodeURIComponent(uploaded ? "GRN uploaded; Broker Invoice moved to GRN." : "Broker Invoice moved to GRN without a document.")}`);
}

export async function updateSaleLotsBulk(saleId: string, formData: FormData) {
  const { supabase, profile } = await requireProfile(["owner"]);
  const detail = await saleDetailPath(supabase, profile.factory_id, saleId);
  const lotIds = formData
    .getAll("lot_id")
    .map((value) => str(value))
    .filter(Boolean);
  if (lotIds.length === 0) back(detail, "Select at least one lot to edit.");

  const requestedState = str(formData.get("state"));
  const validStates = new Set(["invoiced", "acknowledged", "valued", "sold"]);
  const state = validStates.has(requestedState) ? requestedState : "";
  const invoiceText = str(formData.get("invoice_no"));
  const invoiceList = invoiceText
    ? [...new Set(invoiceText.split(/[,\s]+/).map((value) => formatFourDigitNo(value)).filter(Boolean))]
    : [];
  const lotNoText = str(formData.get("lot_no"));
  const lotNo = lotNoText ? formatFourDigitNo(lotNoText) : "";
  const grade = str(formData.get("grade"));
  const bags = num(formData.get("bags"));
  const kgPerBag = num(formData.get("kg_per_bag"));
  const sampleKg = Math.max(0, num(formData.get("sample_allowance")) || 0);
  const buyerName = str(formData.get("buyer_name"));
  const buyerVatNo = str(formData.get("buyer_vat_no"));
  const pricePerKg = num(formData.get("price_per_kg"));
  const proceeds = num(formData.get("proceeds"));
  const vatAmount = num(formData.get("vat_amount"));
  const onGuaranteeRaw = str(formData.get("on_guarantee"));
  const hasInvoice = invoiceList.length > 0;
  const hasLotNo = lotNoText !== "";
  const hasGrade = grade !== "";
  const hasBags = formData.has("bags") && String(formData.get("bags") ?? "").trim() !== "";
  const hasKgPerBag = formData.has("kg_per_bag") && String(formData.get("kg_per_bag") ?? "").trim() !== "";
  const hasSampleKg = formData.has("sample_allowance") && String(formData.get("sample_allowance") ?? "").trim() !== "";
  const hasPrice = formData.has("price_per_kg") && String(formData.get("price_per_kg") ?? "").trim() !== "";
  const hasProceeds = formData.has("proceeds") && String(formData.get("proceeds") ?? "").trim() !== "";
  const hasVat = formData.has("vat_amount") && String(formData.get("vat_amount") ?? "").trim() !== "";
  const hasSaleValues = hasPrice || hasProceeds || hasVat || buyerName || onGuaranteeRaw;
  const hasCompleteSaleValues = hasPrice && hasProceeds && hasVat;
  const nextState = state || (hasCompleteSaleValues ? "sold" : "");

  const { data: lots } = await supabase
    .from("auction_lots")
    .select("id, sale_id, invoice_no, lot_no, grade, bags, kg_per_bag, net_wt, sample_allowance, auction_sales(status)")
    .eq("factory_id", profile.factory_id)
    .in("id", lotIds);
  const lotRows = (lots ?? []) as {
    id: string;
    sale_id: string;
    invoice_no: string | null;
    lot_no: string | null;
    grade: string | null;
    bags: number | null;
    kg_per_bag: string | number | null;
    net_wt: string | number | null;
    sample_allowance: string | number | null;
    auction_sales?: { status?: string | null } | { status?: string | null }[] | null;
  }[];
  if (lotRows.length !== lotIds.length) back(detail, "One or more selected lots could not be found.");
  const settledLot = lotRows.find((lot) => {
    const sale = lot.auction_sales;
    const status = Array.isArray(sale) ? sale[0]?.status : sale?.status;
    return status === "settled";
  });
  if (settledLot) back(detail, "Invoice editing is locked after settlement.");
  if ((hasInvoice || hasLotNo) && lotRows.length !== 1) {
    back(detail, "Invoice and lot number edits can only be applied to one selected lot at a time.");
  }
  if (hasInvoice) {
    const { data: invoiceRows } = await supabase
      .from("lot_invoices")
      .select("invoice_no, lot_id")
      .eq("factory_id", profile.factory_id)
      .in("invoice_no", invoiceList);
    const conflict = (invoiceRows ?? []).find((row) => row.lot_id !== lotRows[0].id);
    if (conflict) back(detail, `Invoice ${conflict.invoice_no as string} is already attached to another lot.`);
  }

  const { data: existingLines } = await supabase
    .from("sale_lines")
    .select("lot_id, buyer_id, price_per_kg, proceeds, vat_amount, on_guarantee")
    .in("lot_id", lotIds);
  const lineByLot = new Map((existingLines ?? []).map((line) => [line.lot_id as string, line]));
  const gradeRules = await gradeRulesByCode(
    supabase,
    profile.factory_id,
    [grade, ...lotRows.map((lot) => lot.grade)],
  );
  // Only a newly typed grade can be wrong here; grades already stored on the
  // selected lots were validated when they were written.
  if (hasGrade && !gradeRules.has(grade)) back(detail, notAnExisting(grade, "tea grade"));

  if (nextState === "sold") {
    const invalidLot = lotRows.find((lot) => {
      const existing = lineByLot.get(lot.id);
      const nextPrice = hasPrice ? pricePerKg : Number(existing?.price_per_kg ?? Number.NaN);
      const nextProceeds = hasProceeds ? proceeds : Number(existing?.proceeds ?? Number.NaN);
      const nextVat = hasVat ? vatAmount : Number(existing?.vat_amount ?? Number.NaN);
      return !(nextPrice > 0) || !(nextProceeds > 0) || Number.isNaN(nextVat);
    });
    if (invalidLot) {
      back(detail, "It is not allowed to change the status to sold without entering Price/kg, proceeds value and VAT.");
    }
  }

  let buyerId: string | null = null;
  if (buyerName) {
    const { data: buyer, error: buyerError } = await supabase
      .from("buyers")
      .upsert({ factory_id: profile.factory_id, name: buyerName, vat_no: buyerVatNo || null }, { onConflict: "factory_id,name" })
      .select("id")
      .single();
    if (buyerError || !buyer?.id) back(detail, buyerError?.message ?? "Could not save buyer.");
    buyerId = (buyer as { id: string }).id;
  }

  if (nextState) {
    await supabase
      .from("auction_lots")
      .update({ state: nextState })
      .eq("factory_id", profile.factory_id)
      .in("id", lotIds);
  }

  for (const lot of lotRows) {
    const nextBags = hasBags ? bags : Number(lot.bags ?? 0);
    const nextKgPerBag = hasKgPerBag ? kgPerBag : Number(lot.kg_per_bag ?? 0);
    const nextSampleKg = hasSampleKg ? sampleKg : Number(lot.sample_allowance ?? 0);
    const lotUpdates: Record<string, string | number | null> = {};
    if (hasInvoice) lotUpdates.invoice_no = invoiceList[0];
    if (hasLotNo) lotUpdates.lot_no = lotNo || null;
    if (hasGrade) lotUpdates.grade = grade;
    if (hasBags) lotUpdates.bags = bags;
    if (hasKgPerBag) lotUpdates.kg_per_bag = kgPerBag;
    if (hasSampleKg) lotUpdates.sample_allowance = sampleKg;
    if (hasBags || hasKgPerBag || hasSampleKg) {
      if (!(nextBags > 0) || !(nextKgPerBag > 0)) back(detail, "Bags and kg/bag must be positive.");
      if (nextSampleKg >= nextBags * nextKgPerBag) back(detail, "Sample weight must be less than the gross lot weight.");
      const nextGrade = hasGrade ? grade : lot.grade;
      const minKgPerBag = nextGrade ? gradeRules.get(nextGrade)?.minKgPerBag : undefined;
      if (minKgPerBag != null && minKgPerBag > 0 && nextKgPerBag < minKgPerBag) {
        back(detail, `kg/bag for grade ${nextGrade} must be at least ${minKgPerBag.toFixed(2)} kg (factory minimum).`);
      }
      lotUpdates.net_wt = Number(Math.max(0, nextBags * nextKgPerBag - nextSampleKg).toFixed(2));
    }
    if (Object.keys(lotUpdates).length > 0) {
      await supabase.from("auction_lots").update(lotUpdates).eq("id", lot.id).eq("factory_id", profile.factory_id);
    }
  }

  if (hasInvoice) {
    const lot = lotRows[0];
    const { error: invoiceDeleteError } = await supabase
      .from("lot_invoices")
      .delete()
      .eq("factory_id", profile.factory_id)
      .eq("lot_id", lot.id);
    if (invoiceDeleteError) back(detail, friendlyError(invoiceDeleteError));
    const { error: invoiceInsertError } = await supabase.from("lot_invoices").insert(invoiceList.map((invoice) => ({
      factory_id: profile.factory_id,
      lot_id: lot.id,
      invoice_no: invoice,
    })));
    if (invoiceInsertError) back(detail, friendlyError(invoiceInsertError));
  }

  if (hasSaleValues || nextState === "sold") {
    const saleLineRows = lotRows.flatMap((lot) => {
      const existing = lineByLot.get(lot.id);
      const shouldWriteLine = Boolean(existing) || nextState === "sold" || hasCompleteSaleValues;
      if (!shouldWriteLine) return [];
      const nextNetWt = hasBags || hasKgPerBag || hasSampleKg
        ? Math.max(0, (hasBags ? bags : Number(lot.bags ?? 0)) * (hasKgPerBag ? kgPerBag : Number(lot.kg_per_bag ?? 0)) - (hasSampleKg ? sampleKg : Number(lot.sample_allowance ?? 0)))
        : Number(lot.net_wt ?? 0);
      const nextSampleAllowance = hasSampleKg ? sampleKg : Number(lot.sample_allowance ?? 0);
      return [{
        factory_id: profile.factory_id,
        sale_id: lot.sale_id,
        lot_id: lot.id,
        buyer_id: buyerId ?? (existing?.buyer_id as string | null | undefined) ?? null,
        net_wt: Number(nextNetWt).toFixed(2),
        sample_allowance: Number(nextSampleAllowance).toFixed(2),
        price_per_kg: (hasPrice ? pricePerKg : Number(existing?.price_per_kg ?? 0)).toFixed(2),
        proceeds: (hasProceeds ? proceeds : Number(existing?.proceeds ?? 0)).toFixed(2),
        vat_amount: (hasVat ? vatAmount : Number(existing?.vat_amount ?? 0)).toFixed(2),
        on_guarantee: onGuaranteeRaw ? onGuaranteeRaw === "true" : Boolean(existing?.on_guarantee ?? false),
      }];
    });
    if (saleLineRows.length > 0) await supabase.from("sale_lines").upsert(saleLineRows, { onConflict: "lot_id" });
  }

  revalidatePath(detail);
  redirect(`${detail}?notice=${encodeURIComponent(`Updated ${lotIds.length} lot(s).`)}`);
}

export async function updateSaleLotsInline(saleId: string, formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireProfile(["owner"]);
  const detail = await saleDetailPath(supabase, profile.factory_id, saleId);
  const validStates = new Set(["invoiced", "acknowledged", "valued", "sold"]);
  const lotIds = formData.getAll("lot_id").map((value) => str(value)).filter(Boolean);
  if (lotIds.length === 0) return { ok: false, error: "Select at least one lot to edit." };

  const values = {
    invoiceNo: formData.getAll("invoice_no").map((value) => str(value)),
    lotNo: formData.getAll("lot_no").map((value) => str(value)),
    grade: formData.getAll("grade").map((value) => str(value)),
    bags: formData.getAll("bags").map((value) => str(value)),
    kgPerBag: formData.getAll("kg_per_bag").map((value) => str(value)),
    sampleKg: formData.getAll("sample_allowance").map((value) => str(value)),
    state: formData.getAll("state").map((value) => str(value)),
    shutout: formData.getAll("shutout").map((value) => str(value)),
    shutoutReason: formData.getAll("shutout_reason").map((value) => str(value)),
    unsold: formData.getAll("unsold").map((value) => str(value)),
    buyerName: formData.getAll("buyer_name").map((value) => str(value)),
    buyerVatNo: formData.getAll("buyer_vat_no").map((value) => str(value)),
    pricePerKg: formData.getAll("price_per_kg").map((value) => str(value)),
    proceeds: formData.getAll("proceeds").map((value) => str(value)),
    vatAmount: formData.getAll("vat_amount").map((value) => str(value)),
    onGuarantee: formData.getAll("on_guarantee").map((value) => str(value)),
  };

  const submittedRows = lotIds.map((id, index) => {
    const invoiceList = [...new Set(
      (values.invoiceNo[index] ?? "")
        .split(/[,\s]+/)
        .map((value) => formatFourDigitNo(value))
        .filter(Boolean),
    )];
    const state = values.state[index] ?? "";
    return {
      id,
      invoiceList,
      lotNo: formatFourDigitNo(values.lotNo[index] ?? "") || null,
      grade: values.grade[index] ?? "",
      bags: Number(values.bags[index] ?? 0),
      kgPerBag: Number(values.kgPerBag[index] ?? 0),
      sampleKg: Math.max(0, Number(values.sampleKg[index] ?? 0) || 0),
      state: validStates.has(state) ? state : "",
      shutout: (values.shutout[index] ?? "") === "true",
      shutoutReason: values.shutoutReason[index] ?? "",
      unsold: (values.unsold[index] ?? "") === "true",
      buyerName: values.buyerName[index] ?? "",
      buyerVatNo: values.buyerVatNo[index] ?? "",
      pricePerKg: values.pricePerKg[index] === "" ? null : Number(values.pricePerKg[index]),
      proceeds: values.proceeds[index] === "" ? null : Number(values.proceeds[index]),
      vatAmount: values.vatAmount[index] === "" ? null : Number(values.vatAmount[index]),
      onGuarantee: values.onGuarantee[index] === "" ? null : values.onGuarantee[index] === "true",
    };
  });

  const allSubmittedInvoices = submittedRows.flatMap((row) => row.invoiceList);
  const duplicateInvoice = allSubmittedInvoices.find((invoice, index) => allSubmittedInvoices.indexOf(invoice) !== index);
  if (duplicateInvoice) return { ok: false, error: `Invoice ${duplicateInvoice} is duplicated in the selected rows.` };

  const { data: lots, error: lotsError } = await supabase
    .from("auction_lots")
    .select("id, sale_id, auction_sales(status)")
    .eq("factory_id", profile.factory_id)
    .in("id", lotIds);
  if (lotsError) return { ok: false, error: friendlyError(lotsError) };
  const foundLotIds = new Set((lots ?? []).map((lot) => lot.id as string));
  if (foundLotIds.size !== lotIds.length) return { ok: false, error: "One or more selected lots could not be found." };
  const settledLot = (lots ?? []).find((lot) => {
    const sale = (lot as unknown as { auction_sales?: { status?: string | null } | { status?: string | null }[] | null }).auction_sales;
    const status = Array.isArray(sale) ? sale[0]?.status : sale?.status;
    return status === "settled";
  });
  if (settledLot) return { ok: false, error: "Invoice editing is locked after settlement." };
  const saleIdByLotId = new Map((lots ?? []).map((lot) => [lot.id as string, lot.sale_id as string]));

  if (allSubmittedInvoices.length > 0) {
    const { data: invoiceRows, error: invoiceRowsError } = await supabase
      .from("lot_invoices")
      .select("invoice_no, lot_id")
      .eq("factory_id", profile.factory_id)
      .in("invoice_no", allSubmittedInvoices);
    if (invoiceRowsError) return { ok: false, error: friendlyError(invoiceRowsError) };
    const selectedLotSet = new Set(lotIds);
    const conflict = (invoiceRows ?? []).find((row) => !selectedLotSet.has(row.lot_id as string));
    if (conflict) return { ok: false, error: `Invoice ${conflict.invoice_no as string} is already attached to another lot.` };
  }

  const { data: existingLines, error: existingLinesError } = await supabase
    .from("sale_lines")
    .select("lot_id, buyer_id")
    .eq("factory_id", profile.factory_id)
    .in("lot_id", lotIds);
  if (existingLinesError) return { ok: false, error: friendlyError(existingLinesError) };
  const existingLineByLot = new Map((existingLines ?? []).map((line) => [line.lot_id as string, line]));

  const buyerNames = [...new Set(submittedRows.map((row) => row.buyerName).filter(Boolean))];
  const buyerByName = new Map<string, string>();
  for (const buyerName of buyerNames) {
    const row = submittedRows.find((item) => item.buyerName === buyerName);
    const { data: buyer, error: buyerError } = await supabase
      .from("buyers")
      .upsert({ factory_id: profile.factory_id, name: buyerName, vat_no: row?.buyerVatNo || null }, { onConflict: "factory_id,name" })
      .select("id, name")
      .single();
    if (buyerError || !buyer?.id) return { ok: false, error: buyerError ? friendlyError(buyerError) : `Could not save buyer ${buyerName}.` };
    buyerByName.set(buyerName, (buyer as { id: string }).id);
  }

  const gradeRules = await gradeRulesByCode(supabase, profile.factory_id, submittedRows.map((row) => row.grade));
  for (const row of submittedRows) {
    if (row.invoiceList.length === 0) return { ok: false, error: "Invoice number is required for every edited lot." };
    if (!row.grade) return { ok: false, error: "Grade is required for every edited lot." };
    // The foreign key would reject this too, but only the caller knows which
    // value was typed — see gradeRulesByCode.
    if (!gradeRules.has(row.grade)) return { ok: false, error: notAnExisting(row.grade, "tea grade") };
    if (!(row.bags > 0) || !(row.kgPerBag > 0)) return { ok: false, error: "Bags and kg/bag must be positive." };
    if (row.sampleKg >= row.bags * row.kgPerBag) return { ok: false, error: "Sample weight must be less than the gross lot weight." };
    const minKgPerBag = gradeRules.get(row.grade)?.minKgPerBag;
    if (minKgPerBag != null && minKgPerBag > 0 && row.kgPerBag < minKgPerBag) {
      return { ok: false, error: `kg/bag for grade ${row.grade} must be at least ${minKgPerBag.toFixed(2)} kg (factory minimum).` };
    }
    if (row.state === "sold" && (!(Number(row.pricePerKg) > 0) || !(Number(row.proceeds) > 0) || row.vatAmount == null || Number.isNaN(Number(row.vatAmount)))) {
      return { ok: false, error: "It is not allowed to change the status to sold without entering Price/kg, proceeds value and VAT." };
    }
  }

  for (const row of submittedRows) {
    if (!row.unsold) continue;
    const contractBlocked = await unsoldBlockedReason(supabase, profile.factory_id, saleIdByLotId.get(row.id) ?? saleId);
    if (contractBlocked) return { ok: false, error: contractBlocked };
  }

  for (const row of submittedRows) {
    const netWt = Number(Math.max(0, row.bags * row.kgPerBag - row.sampleKg).toFixed(2));
    const { error: lotUpdateError } = await supabase
      .from("auction_lots")
      .update({
        invoice_no: row.invoiceList[0],
        lot_no: row.lotNo,
        grade: row.grade,
        bags: row.bags,
        kg_per_bag: row.kgPerBag,
        sample_allowance: row.sampleKg,
        net_wt: netWt,
        state: row.state,
        shutout: row.shutout,
        shutout_reason: row.shutout ? row.shutoutReason || "Manual override" : null,
        unsold: row.unsold,
      })
      .eq("id", row.id)
      .eq("factory_id", profile.factory_id);
    if (lotUpdateError) return { ok: false, error: friendlyError(lotUpdateError) };

    const { error: invoiceDeleteError } = await supabase
      .from("lot_invoices")
      .delete()
      .eq("factory_id", profile.factory_id)
      .eq("lot_id", row.id);
    if (invoiceDeleteError) return { ok: false, error: friendlyError(invoiceDeleteError) };
    const { error: invoiceInsertError } = await supabase.from("lot_invoices").insert(row.invoiceList.map((invoice) => ({
      factory_id: profile.factory_id,
      lot_id: row.id,
      invoice_no: invoice,
    })));
    if (invoiceInsertError) return { ok: false, error: friendlyError(invoiceInsertError) };

    if (row.unsold) {
      const { data: staleLines, error: staleLineReadError } = await supabase
        .from("sale_lines")
        .select("id")
        .eq("factory_id", profile.factory_id)
        .eq("lot_id", row.id);
      if (staleLineReadError) return { ok: false, error: friendlyError(staleLineReadError) };
      const staleLineIds = (staleLines ?? []).map((line) => line.id as string);
      if (staleLineIds.length > 0) {
        const { error: vatDeleteError } = await supabase
          .from("vat_ledger")
          .delete()
          .eq("factory_id", profile.factory_id)
          .in("sale_line_id", staleLineIds);
        if (vatDeleteError) return { ok: false, error: friendlyError(vatDeleteError) };
        const { error: staleLineDeleteError } = await supabase
          .from("sale_lines")
          .delete()
          .eq("factory_id", profile.factory_id)
          .in("id", staleLineIds);
        if (staleLineDeleteError) return { ok: false, error: friendlyError(staleLineDeleteError) };
      }
      await writeAudit(supabase, profile.factory_id, {
        saleId: saleIdByLotId.get(row.id) ?? saleId,
        lotId: row.id,
        action: "Manual un-sold",
        detail: `Invoice ${row.invoiceList.join(", ")} was manually marked un-sold with ${row.sampleKg.toFixed(2)} kg cumulative sample allowance and ${netWt.toFixed(2)} kg remaining net weight.`,
        reason: "Owner correction or manual workflow without document analysis.",
        actor: profile.name,
      });
      continue;
    }

    const hasSaleLineValues = row.pricePerKg != null || row.proceeds != null || row.vatAmount != null || row.buyerName || row.onGuarantee != null;
    const shouldWriteLine = row.state === "sold" || hasSaleLineValues || existingLineByLot.has(row.id);
    if (shouldWriteLine) {
      const { error: saleLineError } = await supabase.from("sale_lines").upsert({
        factory_id: profile.factory_id,
        sale_id: saleIdByLotId.get(row.id) ?? saleId,
        lot_id: row.id,
        buyer_id: row.buyerName ? buyerByName.get(row.buyerName) ?? null : null,
        net_wt: netWt.toFixed(2),
        sample_allowance: row.sampleKg.toFixed(2),
        price_per_kg: Number(row.pricePerKg ?? 0).toFixed(2),
        proceeds: Number(row.proceeds ?? 0).toFixed(2),
        vat_amount: Number(row.vatAmount ?? 0).toFixed(2),
        on_guarantee: Boolean(row.onGuarantee),
      }, { onConflict: "lot_id" });
      if (saleLineError) return { ok: false, error: friendlyError(saleLineError) };
    }
  }

  revalidatePath(detail);
  return { ok: true, notice: `Updated ${submittedRows.length} lot(s).` };
}
