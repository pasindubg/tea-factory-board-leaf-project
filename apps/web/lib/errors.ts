// Safe error handling for server actions.
//
// Postgres/Supabase errors can leak schema internals (constraint names like
// `users_username_key`, column names, driver messages). We map the handful of
// errors that are meaningful to users to friendly strings, and fall back to a
// generic message for everything else — logging the raw detail server-side.

import { ValidationError } from "./forms";

/**
 * Singular, user-facing noun per referenced table, used when a foreign key
 * rejects a value a LOV field submitted. Adding a new referenced table here is
 * the ONLY step needed for its constraint to report a readable message — the
 * parsing below is generic, so a future LOV inherits this behavior without any
 * change to the framework or to the page using it.
 */
const REFERENCED_ENTITY_LABELS: Record<string, string> = {
  auction_grades: "tea grade",
  auction_sales: "dispatch invoice",
  auction_warehouses: "warehouse",
  brokers: "broker",
  buyers: "buyer",
  collectors: "collector",
  drivers: "driver",
  factories: "factory",
  lines: "line",
  marks: "selling mark",
  quality_tiers: "quality tier",
  suppliers: "customer",
  users: "user",
  vehicles: "vehicle",
};

const MANDATORY_FIELD_LABELS: Record<string, string> = {
  customer_no: "Customer number",
  latitude: "Latitude",
  longitude: "Longitude",
  name: "Name",
  phone: "Mobile number",
};

const CHECK_CONSTRAINT_MESSAGES: Record<string, string> = {
  suppliers_customer_no_check: "Customer number must be digits only.",
  suppliers_phone_check: "Mobile number is required.",
  suppliers_latitude_check: "Latitude must be between -90 and 90.",
  suppliers_longitude_check: "Longitude must be between -180 and 180.",
};

/**
 * The entity behind an insert/update foreign-key violation, plus the offending
 * value WHEN THE DATABASE DISCLOSES IT — which in this app it usually does not.
 *
 * Postgres redacts the key from a constraint violation for a role lacking
 * privileges on the referenced table, and the app connects as `authenticated`:
 *
 *   privileged   Key (factory_id, grade)=(<uuid>, BOPFX) is not present in table "auction_grades".
 *   authenticated  Key is not present in table "auction_grades".
 *
 * Both are handled: the table name survives redaction, so the entity can
 * always be named even when the value cannot. Callers that know what the user
 * submitted should check membership themselves and report the value (see
 * `notAnExisting` in the auction actions) — this stays the backstop.
 *
 * Returns null for the opposite direction (a delete blocked by dependents),
 * which friendlyDeleteError reports instead.
 */
function missingReference(err: unknown): { value: string | null; label: string } | null {
  const source = err as { details?: string | null; message?: string | null } | null;
  const text = `${source?.details ?? ""} ${source?.message ?? ""}`;
  const table = text.match(/is not present in table "([^"]+)"/i)?.[1];
  if (!table) return null;
  const label = REFERENCED_ENTITY_LABELS[table] ?? "record";

  const key = text.match(/Key \(([^)]+)\)=\(([^)]*)\) is not present in table/i);
  if (!key) return { value: null, label };
  const columns = key[1].split(",").map((part) => part.trim());
  const values = key[2].split(",").map((part) => part.trim());
  // The tenant column is never the field the user typed into.
  const index = columns.findIndex((column) => column !== "factory_id");
  const typed = (index >= 0 ? values[index] : values[values.length - 1]) ?? "";
  return { value: typed || null, label };
}

/** Friendly, non-leaky message for a Postgres/Supabase error. */
export function friendlyError(err: unknown): string {
  // Supabase/Postgres errors expose `code` and `message`.
  const code = (err as { code?: string } | null)?.code;
  const msg = (err as { message?: string } | null)?.message ?? "";

  switch (code) {
    case "23505": // unique_violation
      if (msg.includes("users_username_key")) return "That username is already taken.";
      if (msg.includes("uq_payments_supplier_period"))
        return "A statement already exists for this customer and month.";
      if (msg.includes("uq_suppliers_factory_customer_no"))
        return "That customer number is already registered.";
      if (msg.includes("uq_vehicles_factory_no")) return "That vehicle number already exists.";
      if (msg.includes("uq_lines_factory_no")) return "That line number already exists.";
      if (msg.includes("uq_line_drivers_line_driver")) return "That driver is already assigned to this line.";
      return "This record already exists (duplicate).";
    case "23503": { // foreign_key_violation
      // A LOV field pointing at a value its owning table doesn't have. The
      // database is the authority here, so the message names what was typed
      // instead of asking the user to guess.
      const missing = missingReference(err);
      if (missing?.value) return `“${missing.value}” is not an existing ${missing.label}. Choose one from the list.`;
      if (missing) return `That ${missing.label} does not exist. Choose one from the list.`;
      return "A referenced record was not found. Refresh and try again.";
    }
    case "23502": { // not_null_violation
      const column = msg.match(/null value in column "([^"]+)"/i)?.[1];
      const label = column ? MANDATORY_FIELD_LABELS[column] ?? column.replace(/_/g, " ") : null;
      return label ? `${label} is required.` : "A required field is missing.";
    }
    case "23514": { // check_violation
      const constraint = (err as { constraint?: string } | null)?.constraint ?? msg.match(/constraint "([^"]+)"/i)?.[1];
      return CHECK_CONSTRAINT_MESSAGES[constraint ?? ""] ?? "A value is outside the range this field allows.";
    }
    case "22P02": { // invalid_text_representation (e.g. bad UUID)
      // The id-typed counterpart of the case above: free text typed into a LOV
      // backed by ids never reaches the foreign key, it fails to cast first.
      const invalid = msg.match(/invalid input syntax for type \w+: "([^"]*)"/i)?.[1];
      if (invalid) return `“${invalid}” is not an existing record. Choose a value from the list.`;
      return "A selected value is invalid. Refresh and try again.";
    }
    case "22003": { // numeric_field_overflow
      // Postgres names the precision but never the column, so this cannot say
      // WHICH number is too big — the callers' own range checks do that, and
      // this is what is left when one is missing. "Please try again" was the
      // worst possible advice: retrying the same number always fails.
      const digits = `${msg} ${(err as { details?: string } | null)?.details ?? ""}`.match(/less than 10\^(\d+)/i)?.[1];
      const ceiling = digits ? ` It must be under ${(10 ** Number(digits)).toLocaleString()}.` : "";
      return `One of the numbers on this row is too large for the field it goes in.${ceiling} Check the weights, then save again.`;
    }
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
  auction_bundled_dispatch_invoices: "dispatch invoices in a physical dispatch",
  auction_lots: "auction lots",
  auction_sales: "dispatch invoices",
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
