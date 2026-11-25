/**
 * Plain date/time helpers for a person's week. Kept out of the 'use client'
 * component so server pages (the shared schedule link) can call them too.
 */
import type { WeekItem } from './PersonWeek';

const asDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const dayFmt = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const longDayFmt = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
export const dayName = (ymd: string, long = false) => (long ? longDayFmt : dayFmt).format(asDate(ymd));
export const clockText = (m: number) => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')}${m % 1440 < 720 ? 'am' : 'pm'}`;
export const spanText = (a: number, b: number) => {
  const t = (m: number) => `${((Math.floor(m / 60) + 11) % 12) + 1}${m % 60 ? `:${String(m % 60).padStart(2, '0')}` : ''}`;
  const ap = (m: number) => (m % 1440 < 720 ? 'am' : 'pm');
  return ap(a) === ap(b) ? `${t(a)}–${t(b)}${ap(b)}` : `${t(a)}${ap(a)}–${t(b)}${ap(b)}`;
};
export const mapsLink = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

/** The text version of a week, for pasting into a message. */
export function weekAsText(name: string, days: string[], items: WeekItem[]): string {
  const lines = [`${name} – week of ${dayName(days[0], true)}`, ''];
  for (const d of days) {
    const mine = items.filter((i) => i.date === d).sort((a, b) => a.start - b.start);
    lines.push(`${dayName(d, true)}`);
    if (!mine.length) lines.push('  Off');
    for (const i of mine) lines.push(`  ${spanText(i.start, i.end)}  ${i.title}${i.place ? ` – ${i.place}` : ''}${i.address ? ` (${i.address})` : ''}`);
  }
  return lines.join('\n');
}

