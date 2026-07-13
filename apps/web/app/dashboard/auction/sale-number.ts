// Normalize a sale/dispatch number to its comparable core: the trailing run of
// digits with leading zeros stripped. "023", "0038", "2026-023" -> "23"/"38"/"23".
export function saleNoKey(s: string | null | undefined): string {
  const groups = String(s ?? "").match(/\d+/g);
  if (!groups?.length) return String(s ?? "").trim().toLowerCase();
  return String(parseInt(groups[groups.length - 1], 10));
}

export function saleNoMatches(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = saleNoKey(a);
  const right = saleNoKey(b);
  return Boolean(left && right && left === right);
}

export function formatFourDigitNo(value: string | number | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d+$/.test(raw)) return raw.padStart(4, "0");
  return raw.replace(/\d+$/, (digits) => digits.padStart(4, "0"));
}

export function formatSaleNo(value: string | number | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d+$/.test(raw)) return raw.padStart(3, "0");
  return raw.replace(/\d+$/, (digits) => digits.padStart(3, "0"));
}
