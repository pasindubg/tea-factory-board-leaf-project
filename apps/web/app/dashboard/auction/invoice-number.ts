// Composite invoice-number-prefix scheme ("26B01-0021"): a prefix registered
// in invoice_number_prefixes, joined to a 4-digit sequence via "-". Kept
// separate from sale-number.ts because formatFourDigitNo/saleNoKey there parse
// trailing digits only and would misread a prefix's own digits (e.g. "26B01").
import { friendlyError } from "@/lib/errors";
import type { Role } from "@/lib/roles";
import type { Supa } from "./_actions/_shared";
// (type-only import — avoids a runtime cycle since _shared.ts calls into this module)
import { formatFourDigitNo } from "./sale-number";

export type InvoiceCategory = "broker_invoice" | "regular_invoice";

export const CATEGORY_LETTER: Record<InvoiceCategory, string> = {
  broker_invoice: "B",
  regular_invoice: "I",
};

export const CATEGORY_LABEL: Record<InvoiceCategory, string> = {
  broker_invoice: "broker invoice",
  regular_invoice: "regular invoice",
};

export type InvoicePrefixOption = { id: string; prefix: string; active: boolean };

export function buildCompositeInvoiceNo(prefix: string, seq: string | number): string {
  return `${prefix}-${formatFourDigitNo(seq)}`;
}

/** Splits a composite number on its LAST "-" — prefixes never contain one. */
export function parseCompositeInvoiceNo(value: string | null | undefined): { prefix: string; seq: string } | null {
  const raw = String(value ?? "").trim();
  const dash = raw.lastIndexOf("-");
  if (dash <= 0 || dash === raw.length - 1) return null;
  return { prefix: raw.slice(0, dash), seq: raw.slice(dash + 1) };
}

/**
 * The sequence part of a submitted invoice number, whether or not it still
 * carries a prefix.
 *
 * Every edit form pre-fills its input with the stored value, which is the full
 * composite ("26I01-0003"). Feeding that straight back into
 * buildCompositeInvoiceNo prefixes it a second time and stores
 * "26I01-26I01-0003" — note that formatFourDigitNo does NOT strip a prefix, it
 * only pads the trailing digits, so it cannot catch this on its own. Always
 * run user-submitted invoice numbers through here before re-composing.
 */
export function invoiceSeqOf(value: string | null | undefined): string {
  return parseCompositeInvoiceNo(value)?.seq ?? String(value ?? "").trim();
}

export type ResolveInvoicePrefixResult =
  | { ok: true; needsApproval: false; prefix: { id: string; prefix: string } }
  | { ok: true; needsApproval: true; requestedPrefixId: string }
  | { ok: false; error: string };

/**
 * Resolves which prefix a new broker/regular invoice should use.
 * - No request (or it matches the active one) → the active prefix, no approval.
 * - A different, existing prefix requested by owner/manager/supervisor → allowed directly (bypass).
 * - The same, requested by anyone else → needs supervisor approval instead of creating the record.
 *
 * A prefix may be asked for two ways, and BOTH must be honoured: `prefix_id`
 * from a picker, or `requestedPrefix` — the literal prefix a user typed into
 * the number itself ("26I02-0001"). Most screens have no picker, so without
 * the second the typed prefix was silently replaced by the active one and the
 * number the user entered was not the number that got stored. An id wins when
 * both are given, since a picker is an explicit choice.
 */
export async function resolveInvoicePrefix({
  supabase,
  factoryId,
  category,
  role,
  requestedPrefixId,
  requestedPrefix,
}: {
  supabase: Supa;
  factoryId: string;
  category: InvoiceCategory;
  role: Role;
  requestedPrefixId?: string | null;
  /** Literal prefix string, e.g. the "26I02" of a typed "26I02-0001". */
  requestedPrefix?: string | null;
}): Promise<ResolveInvoicePrefixResult> {
  const { data: active, error: activeError } = await supabase
    .from("invoice_number_prefixes")
    .select("id, prefix")
    .eq("factory_id", factoryId)
    .eq("category", category)
    .eq("active", true)
    .maybeSingle();
  if (activeError) return { ok: false, error: friendlyError(activeError) };
  if (!active) {
    return {
      ok: false,
      error: `No active ${CATEGORY_LABEL[category]} number prefix is configured. Ask an owner, manager, or supervisor to create and activate one under Invoice number prefixes.`,
    };
  }
  const active_ = active as { id: string; prefix: string };
  const typedPrefix = String(requestedPrefix ?? "").trim();
  // A typed prefix equal to the active one is not a request for anything else.
  const wantsTyped = Boolean(typedPrefix) && typedPrefix !== active_.prefix;
  if (!requestedPrefixId && !wantsTyped) {
    return { ok: true, needsApproval: false, prefix: active_ };
  }
  if (requestedPrefixId && requestedPrefixId === active_.id) {
    return { ok: true, needsApproval: false, prefix: active_ };
  }

  const lookup = supabase
    .from("invoice_number_prefixes")
    .select("id, prefix")
    .eq("factory_id", factoryId)
    .eq("category", category);
  const { data: requested, error: requestedError } = await (requestedPrefixId
    ? lookup.eq("id", requestedPrefixId)
    : lookup.eq("prefix", typedPrefix)).maybeSingle();
  if (requestedError) return { ok: false, error: friendlyError(requestedError) };
  if (!requested) {
    // Naming the value matters here: the user typed it, so "unknown prefix"
    // alone leaves them guessing which part of the number was wrong.
    return {
      ok: false,
      error: requestedPrefixId
        ? "Unknown invoice number prefix."
        : `“${typedPrefix}” is not a registered ${CATEGORY_LABEL[category]} number prefix. Add it under Invoice number prefixes first.`,
    };
  }
  const requested_ = requested as { id: string; prefix: string };
  if (role === "owner" || role === "manager" || role === "supervisor") {
    return { ok: true, needsApproval: false, prefix: requested_ };
  }
  return { ok: true, needsApproval: true, requestedPrefixId: requested_.id };
}
