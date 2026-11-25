import { addDays, melbourneMidnightUtc, offsetMinutes, TZ } from '../time/melbourne';

/**
 * Planner time helpers. Jobs are stored as UTC instants; people plan in
 * Melbourne local dates and clock times, so everything converts through here.
 */

const partsFmt = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Melbourne calendar date and minutes from midnight for an instant. */
export function melbourneLocal(iso: string | Date): { ymd: string; minutes: number } {
  const p = Object.fromEntries(partsFmt.formatToParts(typeof iso === 'string' ? new Date(iso) : iso).map((x) => [x.type, x.value]));
  return { ymd: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

/** UTC instant for a Melbourne local date and minutes from midnight (DST-correct). */
export function localToUtc(ymd: string, minutes: number): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  let t = guess - offsetMinutes(new Date(guess)) * 60000;
  t = guess - offsetMinutes(new Date(t)) * 60000;
  return new Date(t);
}

export const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** Monday of the week containing a date. */
export function mondayOf(ymd: string): string {
  const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  return addDays(ymd, -((dow + 6) % 7));
}

/** [start, end) of a Monday–Sunday week as UTC ISO strings. */
export function weekRange(weekStart: string): { gte: string; lt: string } {
  return { gte: melbourneMidnightUtc(weekStart).toISOString(), lt: melbourneMidnightUtc(addDays(weekStart, 7)).toISOString() };
}

export const weekDays = (weekStart: string) => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

export function clock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

const dayFmt = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const longDayFmt = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
export const dayLabel = (ymd: string, long = false) => (long ? longDayFmt : dayFmt).format(new Date(`${ymd}T00:00:00Z`));

/** "Tue 1 Dec, 6:30 am – 8:00 am" */
export function whenLabel(startsAt: string, endsAt: string): string {
  const s = melbourneLocal(startsAt);
  const e = melbourneLocal(endsAt);
  return `${dayLabel(s.ymd)}, ${clock(s.minutes)} – ${clock(e.minutes)}`;
}
