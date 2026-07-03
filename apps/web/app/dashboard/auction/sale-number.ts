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
