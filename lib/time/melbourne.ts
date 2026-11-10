/** Melbourne time helpers (handles AEST/AEDT daylight saving via Intl – no libraries). */
export const TZ = 'Australia/Melbourne';

function parts(date: Date, timeZone = TZ) {
  const f = new Intl.DateTimeFormat('en-AU', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

/** Offset of Melbourne from UTC in minutes at a given instant (+600 AEST, +660 AEDT). */
export function offsetMinutes(date: Date, timeZone = TZ): number {
  const p = parts(date, timeZone);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** YYYY-MM-DD for the Melbourne calendar day containing `date`. */
export function melbourneDate(date = new Date()): string {
  const p = parts(date);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** UTC instant of local midnight at the start of a Melbourne calendar day. */
export function melbourneMidnightUtc(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offsetMinutes(new Date(guess)) * 60000;
  t = guess - offsetMinutes(new Date(t)) * 60000; // re-evaluate across DST boundaries
  return new Date(t);
}

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** [start, end) UTC ISO strings covering the Melbourne day. */
export function melbourneDayRange(ymd: string): { start: string; end: string } {
  return { start: melbourneMidnightUtc(ymd).toISOString(), end: melbourneMidnightUtc(addDays(ymd, 1)).toISOString() };
}

export function formatMelbourne(iso: string | Date, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }) {
  return new Intl.DateTimeFormat('en-AU', { timeZone: TZ, ...opts }).format(typeof iso === 'string' ? new Date(iso) : iso);
}
