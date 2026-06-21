// Safe error handling for server actions.
//
// Postgres/Supabase errors can leak schema internals (constraint names like
// `users_username_key`, column names, driver messages). We map the handful of
// errors that are meaningful to users to friendly strings, and fall back to a
// generic message for everything else — logging the raw detail server-side.

import type { ValidationError } from "./forms";

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

/** A flat, safe redirect URL carrying a `?error=` the UI can render. */
export function errorRedirect(base: string, err: unknown): string {
  const msg = err instanceof ValidationError ? err.message : friendlyError(err);
  return `${base}?error=${encodeURIComponent(msg)}`;
}
