// The bounds every lot field must satisfy — in ONE place, shared by the input
// that renders it and the server action that saves it.
//
// They used to be typed into each `<input min=…>` by hand, and the four places
// that render a lot row had drifted apart: kg/bag was `min=0` on Invoice
// Overview and `min=0.01` on Dispatch Invoice Details, the edit row relaxed
// both to 0, and nothing capped anything at all. A mistyped weight either
// saved silently (10 bags × 99999 kg = a 999,987 kg lot) or reached Postgres
// and came back as "Something went wrong saving that".

/** A numeric lot field: what the input allows, and what the server enforces. */
export type LotNumberLimit = {
  label: string;
  min: number;
  max: number;
  step: number;
  /** Whole numbers only — used for the message, the step already says it. */
  integer?: boolean;
};

/**
 * Ceilings are deliberately generous rather than typical: they exist to catch
 * a slipped digit, not to argue with the factory about how it packs tea. A
 * 1,000 kg bag is already absurd; 100,000 is a typo.
 */
export const LOT_NUMBER_LIMITS = {
  bags: { label: "Bags", min: 1, max: 9999, step: 1, integer: true },
  kgPerBag: { label: "Weight per bag", min: 0.01, max: 1000, step: 0.01 },
  sampleKg: { label: "Sample weight", min: 0, max: 9999.99, step: 0.01 },
  // A percentage. The column is numeric(5,2), so anything over 999.99
  // overflowed the database rather than being refused.
  moisture: { label: "Moisture level", min: 0, max: 100, step: 0.1 },
} as const satisfies Record<string, LotNumberLimit>;

/**
 * Length caps for the free-text fields.
 *
 * Nothing bounded them, so a paste of any size was stored and carried through
 * to the printed estate invoice, where it has nowhere to go.
 */
export const LOT_TEXT_LIMITS = {
  invoiceNo: 32,
  lotNo: 32,
  typeOfChests: 60,
  chestNumbers: 120,
} as const;

/** Input attributes for a numeric lot field, so a form cannot disagree with
 * the server about what it accepts. */
export function lotNumberProps(field: keyof typeof LOT_NUMBER_LIMITS) {
  const limit = LOT_NUMBER_LIMITS[field];
  return { type: "number" as const, min: limit.min, max: limit.max, step: limit.step };
}

/**
 * The first range a submitted lot breaks, named — or null when they all hold.
 *
 * Server-side because the browser's `min`/`max` are a convenience the operator
 * can bypass, and because a message naming the field is the whole point: the
 * database's own complaint names nothing.
 */
export function lotRangeError(values: Partial<Record<keyof typeof LOT_NUMBER_LIMITS, number | null | undefined>>): string | null {
  for (const [field, limit] of Object.entries(LOT_NUMBER_LIMITS) as [keyof typeof LOT_NUMBER_LIMITS, LotNumberLimit][]) {
    const value = values[field];
    if (value == null || Number.isNaN(value)) continue;
    if (limit.integer && !Number.isInteger(value)) return `${limit.label} must be a whole number.`;
    if (value < limit.min || value > limit.max) {
      return `${limit.label} must be between ${limit.min} and ${limit.max}. You entered ${value}.`;
    }
  }
  return null;
}
