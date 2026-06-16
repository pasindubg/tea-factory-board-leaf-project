// All "local" date math here relies on the process timezone being the factory's
// timezone: the web app runs with TZ=Asia/Colombo (set in package.json scripts;
// set the same env var on the deploy host). If factories ever span timezones,
// replace this with a per-factory timezone column and explicit tz-aware math.
if (process.env.TZ !== "Asia/Colombo") {
  throw new Error(`TZ must be "Asia/Colombo", got ${JSON.stringify(process.env.TZ)}`);
}

/** [start, end) ISO range for a local calendar day; date as YYYY-MM-DD. */
export function dayRange(date: string): { start: string; end: string } {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Local YYYY-MM-DD for a Date (defaults to now). */
export function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** The last n local dates (oldest first), ending today. */
export function lastNDates(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(localDateString(new Date(Date.now() - i * 24 * 60 * 60 * 1000)));
  }
  return out;
}
