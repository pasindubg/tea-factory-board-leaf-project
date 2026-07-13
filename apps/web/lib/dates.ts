// Keep factory calendar calculations independent of the host process timezone.
// Vercel and other managed runtimes may reserve TZ and run in UTC, while the
// factory's operational calendar is Asia/Colombo. If factories ever span
// timezones, replace this constant with a per-factory timezone column.
const FACTORY_TIME_ZONE = "Asia/Colombo";
const COLOMBO_MIDNIGHT_OFFSET = "+05:30";

const DATE_STRING_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Whether `date` is a real calendar date in YYYY-MM-DD form. */
export function isValidDateString(date: string): boolean {
  if (!DATE_STRING_RE.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00${COLOMBO_MIDNIGHT_OFFSET}`);
  return !Number.isNaN(parsed.getTime()) && localDateString(parsed) === date;
}

/** [start, end) ISO range for a local calendar day; date as YYYY-MM-DD. */
export function dayRange(date: string): { start: string; end: string } {
  const start = new Date(`${date}T00:00:00${COLOMBO_MIDNIGHT_OFFSET}`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Local YYYY-MM-DD for a Date (defaults to now). */
export function localDateString(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: FACTORY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/** The last n local dates (oldest first), ending today. */
export function lastNDates(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(localDateString(new Date(Date.now() - i * 24 * 60 * 60 * 1000)));
  }
  return out;
}
