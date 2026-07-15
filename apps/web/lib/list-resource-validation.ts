export type ParsedResourceParams = Readonly<Record<string, unknown>>;
export type ResourceParamResult =
  | { ok: true; value: ParsedResourceParams }
  | { ok: false; error: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseNoListParams(input: unknown): ResourceParamResult {
  if (input == null) return { ok: true, value: {} };
  if (typeof input === "object" && !Array.isArray(input) && Object.keys(input).length === 0) {
    return { ok: true, value: {} };
  }
  return { ok: false, error: "This list does not accept parameters." };
}

export function parseUuidListParams(input: unknown, key: string): ResourceParamResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Invalid list parameters." };
  }
  const params = input as Record<string, unknown>;
  const value = params[key];
  if (Object.keys(params).length !== 1 || typeof value !== "string" || !UUID_PATTERN.test(value)) {
    return { ok: false, error: "Invalid list parameters." };
  }
  return { ok: true, value: { [key]: value } };
}

export function parsePaymentPeriodParams(input: unknown): ResourceParamResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Invalid list parameters." };
  }
  const params = input as Record<string, unknown>;
  if (
    Object.keys(params).length !== 2
    || !Number.isInteger(params.year)
    || !Number.isInteger(params.month)
    || Number(params.year) < 2000
    || Number(params.year) > 2200
    || Number(params.month) < 1
    || Number(params.month) > 12
  ) {
    return { ok: false, error: "Invalid list parameters." };
  }
  return { ok: true, value: { year: Number(params.year), month: Number(params.month) } };
}

export function parseWeighingListParams(input: unknown): ResourceParamResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Invalid list parameters." };
  }
  const params = input as Record<string, unknown>;
  const allowed = new Set(["from", "to", "supplierId", "collectorId"]);
  if (Object.keys(params).some((key) => !allowed.has(key))) return { ok: false, error: "Invalid list parameters." };
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  for (const key of ["from", "to"] as const) {
    const value = params[key];
    if (value != null && (typeof value !== "string" || !datePattern.test(value))) {
      return { ok: false, error: "Invalid list parameters." };
    }
  }
  for (const key of ["supplierId", "collectorId"] as const) {
    const value = params[key];
    if (value != null && (typeof value !== "string" || !UUID_PATTERN.test(value))) {
      return { ok: false, error: "Invalid list parameters." };
    }
  }
  return {
    ok: true,
    value: Object.fromEntries(Object.entries(params).filter(([, value]) => value != null && value !== "")),
  };
}
