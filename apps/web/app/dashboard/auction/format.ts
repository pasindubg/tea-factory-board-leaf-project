// Shared LKR amount formatter for the auction pages (2-decimal, en-LK grouping).
export function money(n: number) {
  return n.toLocaleString("en-LK", { minimumFractionDigits: 2 });
}
