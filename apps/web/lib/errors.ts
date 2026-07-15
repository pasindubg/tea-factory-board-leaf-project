// Safe error handling for server actions.
//
// Postgres/Supabase errors can leak schema internals (constraint names like
// `users_username_key`, column names, driver messages). We map the handful of
// errors that are meaningful to users to friendly strings, and fall back to a
// generic message for everything else — logging the raw detail server-side.

import { ValidationError } from "./forms";

/** Friendly, non-leaky message for a Postgres/Supabase error. */
export function friendlyError(err: unknown): string {
  // Supabase/Postgres errors expose `code` and `message`.
  const code = (err as { code?: string } | null)?.code;
  const msg = (err as { message?: string } | null)?.message ?? "";

  switch (code) {
    case "23505": // unique_violation
      if (msg.includes("users_username_key")) return "That username is already taken.";
      if (msg.includes("uq_payments_supplier_period"))
        return "A statement already exists for this supplier and month.";
      return "This record already exists (duplicate).";
    case "23503": // foreign_key_violation
      return "A referenced record was not found. Refresh and try again.";
    case "23502": // not_null_violation
      return "A required field is missing.";
    case "22P02": // invalid_text_representation (e.g. bad UUID)
      return "A selected value is invalid. Refresh and try again.";
    case "42501": // insufficient_privilege (RLS denial)
      return "You don't have permission to do that.";
    default:
      // Don't surface the raw message — it can reveal schema details.
      console.error("[server action] unhandled DB error:", code, msg);
      return "Something went wrong saving that. Please try again.";
  }
}

const DEPENDENT_RECORD_LABELS: Record<string, string> = {
  auction_audit: "auction audit history",
  auction_bundled_dispatch_invoices: "bundled dispatch broker invoices",
  auction_lots: "auction lots",
  auction_sales: "broker invoices",
  bank_txns: "bank transactions",
  broker_grade_thresholds: "broker and grade threshold settings",
  broker_rates: "broker rate cards",
  collectors: "collectors",
  doc_imports: "document imports",
  lot_invoices: "lot invoices",
  payment_lines: "payment lines",
  payments: "supplier payments",
  sale_lines: "sale lines",
  settlement_charges: "settlement charges",
  settlements: "settlements",
  supplier_adjustments: "supplier adjustments",
  supplier_messages: "supplier messages",
  supplier_requests: "supplier requests",
  supplier_tiers: "supplier tier assignments",
  suppliers: "suppliers",
  valuations: "valuations",
  vat_ledger: "VAT ledger entries",
  weighings: "weighings",
};

function dependentTable(err: unknown): string | null {
  const value = err as { details?: string | null; message?: string | null } | null;
  const text = `${value?.details ?? ""} ${value?.message ?? ""}`;
  return text.match(/referenced from table "([^"]+)"/i)?.[1]
    ?? text.match(/constraint "[^"]+" on table "([^"]+)"/i)?.[1]
    ?? null;
}

/** Friendly delete-specific handling, including the dependent record type. */
export function friendlyDeleteError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  if (code !== "23503") return friendlyError(err);

  const table = dependentTable(err);
  const label = table ? DEPENDENT_RECORD_LABELS[table] : null;
  const usage = label ? label : "other records";
  return `This record is being used by ${usage} and cannot be deleted. Remove or reassign those records first.`;
}

/** A flat, safe redirect URL carrying a `?error=` the UI can render. */
export function errorRedirect(base: string, err: unknown): string {
  const msg = err instanceof ValidationError ? err.message : friendlyError(err);
  return `${base}?error=${encodeURIComponent(msg)}`;
}
