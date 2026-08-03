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

/*
 * Display formatters. Both the locale and the time zone are pinned on purpose.
 * `toLocaleString()` with no locale uses whatever the runtime defaults to —
 * en-US/UTC on the server, the visitor's own locale and zone in the browser —
 * so the server HTML and the hydrated client text disagree ("Jun 22, 2026,
 * 6:06 PM" vs "22 Jun 2026, 18:06") and React discards the tree. Pinning both
 * makes the two sides render identically, and shows every user the factory's
 * calendar rather than their device's.
 */
const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: FACTORY_TIME_ZONE,
  dateStyle: "medium",
  timeStyle: "short",
});

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: FACTORY_TIME_ZONE,
  dateStyle: "medium",
});

const WEEKDAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: FACTORY_TIME_ZONE,
  weekday: "short",
});

const FULL_DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: FACTORY_TIME_ZONE,
  dateStyle: "full",
});

function parse(value: string | number | Date | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Factory-local date and time, e.g. "22 Jun 2026, 18:06". */
export function formatDateTime(value: string | number | Date | null | undefined, fallback = "—"): string {
  const parsed = parse(value);
  return parsed ? DATE_TIME_FORMAT.format(parsed) : fallback;
}

/** Factory-local date, e.g. "22 Jun 2026". */
export function formatDate(value: string | number | Date | null | undefined, fallback = "—"): string {
  const parsed = parse(value);
  return parsed ? DATE_FORMAT.format(parsed) : fallback;
}

/** Factory-local weekday, e.g. "Mon". */
export function formatWeekday(value: string | number | Date | null | undefined, fallback = "—"): string {
  const parsed = parse(value);
  return parsed ? WEEKDAY_FORMAT.format(parsed) : fallback;
}

/** Factory-local long date, e.g. "Monday, 22 June 2026". */
export function formatFullDate(value: string | number | Date | null | undefined, fallback = "—"): string {
  const parsed = parse(value);
  return parsed ? FULL_DATE_FORMAT.format(parsed) : fallback;
}

/** The last n local dates (oldest first), ending today. */
export function lastNDates(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(localDateString(new Date(Date.now() - i * 24 * 60 * 60 * 1000)));
  }
  return out;
}
