// Lightweight, dependency-free form validation helpers used by server actions.
// We intentionally avoid pulling in zod as a direct dependency (it is only a
// transitive one today) to keep the lockfile stable for concurrent work.
//
// Every `parse*` helper throws a `ValidationError` on bad input. Server actions
// catch `ValidationError` and surface `message` (a safe, user-facing string) —
// never the raw driver/Postgres error, which can leak schema details.

export class ValidationError extends Error {}

/** Read a required trimmed string field. */
export function parseString(formData: FormData, field: string): string {
  const v = String(formData.get(field) ?? "").trim();
  if (!v) throw new ValidationError(`${field} is required.`);
  return v;
}

/** Read an optional string field → null when empty. */
export function parseOptionalString(formData: FormData, field: string): string | null {
  const v = String(formData.get(field) ?? "").trim();
  return v || null;
}

/** Read a value that must be a member of an allow-list (e.g. an enum). */
export function parseEnum<T extends string>(
  formData: FormData,
  field: string,
  allowed: readonly T[],
): T {
  const v = String(formData.get(field) ?? "").trim();
  if (!allowed.includes(v as T)) {
    throw new ValidationError(`Invalid value for ${field}.`);
  }
  return v as T;
}

/**
 * Read a non-negative number with an optional upper bound. Rejects NaN,
 * negatives, and non-finite values. `max` inclusive.
 */
export function parseNonNegativeNumber(
  formData: FormData,
  field: string,
  opts: { max?: number; allowZero?: boolean } = {},
): number {
  const raw = String(formData.get(field) ?? "").trim();
  const n = Number(raw);
  if (raw === "" || !Number.isFinite(n)) {
    throw new ValidationError(`${field} must be a number.`);
  }
  if (n < 0) throw new ValidationError(`${field} cannot be negative.`);
  if (!opts.allowZero && n === 0) {
    throw new ValidationError(`${field} must be greater than zero.`);
  }
  if (opts.max != null && n > opts.max) {
    throw new ValidationError(`${field} cannot exceed ${opts.max}.`);
  }
  return n;
}

/** Read a strictly positive number (the common case for weights and rates). */
export function parsePositiveNumber(formData: FormData, field: string, max?: number): number {
  const n = parseNonNegativeNumber(formData, field, { max, allowZero: false });
  if (n <= 0) throw new ValidationError(`${field} must be greater than zero.`);
  return n;
}

/** Read an optional number → null when blank; otherwise validated non-negative. */
export function parseOptionalNonNegativeNumber(
  formData: FormData,
  field: string,
  max?: number,
): number | null {
  const raw = String(formData.get(field) ?? "").trim();
  if (raw === "") return null;
  return parseNonNegativeNumber(formData, field, { max, allowZero: true });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Read a YYYY-MM-DD date; throws if malformed or not a real calendar date. */
export function parseDateString(formData: FormData, field: string): string {
  const v = String(formData.get(field) ?? "").trim();
  if (!DATE_RE.test(v) || Number.isNaN(new Date(`${v}T00:00:00`).getTime())) {
    throw new ValidationError(`${field} must be a valid date (YYYY-MM-DD).`);
  }
  return v;
}

/**
 * Read a datetime-local / ISO-ish timestamp and return it as an ISO string.
 * Defaults to "now" when blank. Throws on a value that can't be parsed.
 */
export function parseTimestamp(formData: FormData, field: string, fallbackNow = true): string {
  const v = String(formData.get(field) ?? "").trim();
  if (!v) return fallbackNow ? new Date().toISOString() : "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    throw new ValidationError(`${field} is not a valid date/time.`);
  }
  return d.toISOString();
}
