/**
 * The comparable core of a lot-invoice number, used to match the factory's own
 * records against a broker's document.
 *
 * The factory numbers its invoices with an index-cycle prefix ("26I01-0001"),
 * but that prefix is internal — a broker's acknowledgement, valuation or
 * seller's contract only ever prints the bare sequence ("0001"). Comparing the
 * two verbatim makes every line fail to match, which surfaces as every invoice
 * being "not-acknowledged" and every document line lacking an invoice of ours.
 *
 * Leading zeros are also dropped, so "0001", "001" and "1" all agree — brokers
 * are not consistent about padding.
 *
 * This is a MATCHING key only. It is deliberately not what gets displayed or
 * stored: the screens keep showing the full "26I01-0001" the factory issued.
 */
export function invoiceMatchKey(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  // An index-cycle prefix never contains "-", so the last dash separates it
  // from the sequence. A bare number has no dash and is used as-is.
  const dash = raw.lastIndexOf("-");
  const sequence = dash > 0 && dash < raw.length - 1 ? raw.slice(dash + 1) : raw;

  const digits = sequence.match(/\d+$/)?.[0];
  // A sequence that is not numeric at all (unusual, but do not silently
  // collapse it to "") falls back to a case-insensitive comparison.
  return digits ? String(Number(digits)) : sequence.toUpperCase();
}

/** Whether two invoice numbers refer to the same invoice, prefix or not. */
export function invoiceNumbersMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = invoiceMatchKey(left);
  const b = invoiceMatchKey(right);
  return a !== "" && a === b;
}
