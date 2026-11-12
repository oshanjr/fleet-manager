/**
 * Date helpers. All business dates are stored as UTC midnight of the
 * calendar day (e.g. "2026-11-12" -> 2026-11-12T00:00:00.000Z) so that the
 * day never shifts regardless of the server (Vercel = UTC) or browser
 * timezone (Sri Lanka = UTC+5:30).
 */

export const LK_TIMEZONE = "Asia/Colombo";

/** Today's calendar date in Sri Lanka as "YYYY-MM-DD". */
export function todayLK(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: LK_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Parse "YYYY-MM-DD" into a UTC-midnight Date. Falls back to today (LK). */
export function toDayDate(dateStr?: string | null): Date {
  const s = dateStr && /^\d{4}-\d{2}-\d{2}/.test(dateStr) ? dateStr.slice(0, 10) : todayLK();
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Optional variant: returns null for empty input. */
export function toOptionalDayDate(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  return toDayDate(dateStr);
}

/** Format a stored Date back to "YYYY-MM-DD" (UTC calendar day). */
export function dayStr(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

/** Add days to a "YYYY-MM-DD" string. */
export function addDays(dateStr: string, days: number): string {
  const d = toDayDate(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return dayStr(d);
}

/** Whole days from `from` to `to` (both "YYYY-MM-DD"). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toDayDate(to).getTime() - toDayDate(from).getTime()) / 86400000);
}

/** First and last day of a "YYYY-MM" month. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

