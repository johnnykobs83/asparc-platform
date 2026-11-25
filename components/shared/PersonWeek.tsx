'use client';

import { useState, type ReactNode } from 'react';
import { clockText, dayName, mapsLink, spanText } from './week-format';

/**
 * One person's week as a calendar: a Monday–Sunday time grid on larger screens
 * and a day-by-day list on phones. Used by My Week in the dashboard and by the
 * shared (read-only) schedule link.
 */

export interface WeekItem {
  id: string;
  /** Melbourne date, YYYY-MM-DD */
  date: string;
  /** Minutes from midnight, Melbourne time */
  start: number;
  end: number;
  title: string;
  place?: string | null;
  address?: string | null;
  colour?: string | null;
  /** Extra lines shown in the details (e.g. "With Sam", "Covering Priya"). */
  lines?: string[];
  badge?: { text: string; tone: 'green' | 'amber' | 'blue' } | null;
}

const tint = (hex: string | null | undefined, alpha = '2e') => (hex && /^#[0-9A-Fa-f]{6}$/.test(hex) ? `${hex}${alpha}` : `#14519C${alpha}`);
const BADGE: Record<string, string> = { green: 'bg-[#e9f7ef] text-success border-success/25', amber: 'bg-[#fff4e0] text-warn border-warn/25', blue: 'bg-[#e8f0fa] text-royal-800 border-royal/20' };

export function PersonWeek({ days, items, today, onOpen, renderDetails, emptyText = 'Off' }: { days: string[]; items: WeekItem[]; today?: string; onOpen?: (id: string) => void; renderDetails?: (item: WeekItem) => ReactNode; emptyText?: string }) {
  const [open, setOpen] = useState<WeekItem | null>(null);
  const click = (i: WeekItem) => (onOpen ? onOpen(i.id) : setOpen(i));
  const from = Math.min(360, ...items.map((i) => Math.floor(i.start / 60) * 60));
  const to = Math.max(1200, ...items.map((i) => Math.ceil(i.end / 60) * 60));
  const H = 48; // px per hour
  const y = (m: number) => ((m - from) / 60) * H;
  const hours = Array.from({ length: (to - from) / 60 }, (_, i) => from + i * 60);
  const total = items.reduce((s, i) => s + (i.end - i.start), 0);

  return (
    <>
      <p className="mb-2 text-sm text-muted">
        {items.length ? `${items.length} job${items.length === 1 ? '' : 's'} · ${Math.round((total / 60) * 10) / 10} hours` : 'Nothing planned this week.'}
      </p>
      {/* Time grid (tablet and up) */}
      <div className="hidden overflow-hidden rounded-xl border border-line bg-white md:block">
        <div className="grid" style={{ gridTemplateColumns: '56px repeat(7, minmax(0, 1fr))' }}>
          <div className="border-b border-line" />
          {days.map((d) => (
            <div key={d} className={`border-b border-l border-line px-2 py-2 text-center text-xs font-semibold uppercase ${d === today ? 'bg-royal text-white' : ''}`}>
              {dayName(d)}
            </div>
          ))}
          <div className="relative" style={{ height: y(to) }}>
            {hours.slice(1).map((m) => (
              <span key={m} className="absolute right-1.5 -translate-y-1/2 text-[10px] text-muted" style={{ top: y(m) }}>
                {clockText(m).replace(':00', '')}
              </span>
            ))}
          </div>
          {days.map((d) => {
            const dayItems = items.filter((i) => i.date === d).sort((a, b) => a.start - b.start);
            const lanes: number[] = [];
            const placed = dayItems.map((i) => {
              let k = lanes.findIndex((end) => end <= i.start);
              if (k < 0) {
                k = lanes.length;
                lanes.push(0);
              }
              lanes[k] = i.end;
              return { i, k };
            });
            const n = Math.max(1, lanes.length);
            return (
              <div key={d} className={`relative border-l border-line ${d === today ? 'bg-sky-100/30' : ''}`} style={{ height: y(to) }}>
                {hours.map((_, idx) => (
                  <div key={idx} className="absolute inset-x-0 border-t border-line/60" style={{ top: idx * H }} />
                ))}
                {placed.map(({ i, k }) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => click(i)}
                    className="absolute overflow-hidden rounded-md border-l-4 px-1.5 py-1 text-left text-[11px] leading-tight hover:brightness-95"
                    style={{ top: y(i.start) + 1, height: Math.max(y(i.end) - y(i.start) - 2, 24), left: `calc(${(k * 100) / n}% + 2px)`, width: `calc(${100 / n}% - 4px)`, borderLeftColor: i.colour ?? '#14519C', background: tint(i.colour) }}
                    title={`${spanText(i.start, i.end)} ${i.title}${i.place ? ` · ${i.place}` : ''}`}
                  >
                    <span className="block truncate font-semibold">{spanText(i.start, i.end)}</span>
                    <span className="block truncate">{i.title}</span>
                    {i.place && <span className="block truncate text-muted">{i.place}</span>}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Day by day (phones) */}
      <div className="space-y-2 md:hidden">
        {days.map((d) => {
          const dayItems = items.filter((i) => i.date === d).sort((a, b) => a.start - b.start);
          return (
            <section key={d} className={`rounded-xl border bg-white p-3 ${d === today ? 'border-royal' : 'border-line'}`}>
              <h3 className={`font-display text-lg font-bold uppercase ${d === today ? 'text-royal' : ''}`}>{dayName(d, true)}</h3>
              {dayItems.length ? (
                dayItems.map((i) => (
                  <button key={i.id} type="button" onClick={() => click(i)} className="mt-1 grid w-full grid-cols-[72px_1fr] gap-2 border-t border-line py-2 text-left">
                    <span className="text-sm font-semibold">
                      {clockText(i.start)}
                      <span className="block text-xs font-normal text-muted">to {clockText(i.end)}</span>
                    </span>
                    <span className="border-l-4 pl-2" style={{ borderLeftColor: i.colour ?? '#14519C' }}>
                      <span className="block font-medium">{i.title}</span>
                      {i.place && <span className="block text-xs text-muted">{i.place}</span>}
                      {i.badge && <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${BADGE[i.badge.tone]}`}>{i.badge.text}</span>}
                    </span>
                  </button>
                ))
              ) : (
                <p className="text-sm text-muted">{emptyText}</p>
              )}
            </section>
          );
        })}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 bg-charcoal/40" aria-label="Close" onClick={() => setOpen(null)} />
          <div className="relative w-full max-w-md rounded-t-2xl border-t-[6px] bg-white p-5 shadow-2xl sm:rounded-2xl" style={{ borderTopColor: open.colour ?? '#14519C' }}>
            <p className="text-sm font-semibold text-royal">
              {dayName(open.date, true)} · {clockText(open.start)}–{clockText(open.end)}
            </p>
            <h3 className="mt-0.5 font-display text-2xl font-bold uppercase leading-tight">{open.title}</h3>
            {open.place && <p className="mt-1 font-medium">{open.place}</p>}
            {open.address && (
              <a className="text-sm text-royal underline" href={mapsLink(open.address)} target="_blank" rel="noopener noreferrer">
                {open.address}
              </a>
            )}
            {open.lines?.map((l) => (
              <p key={l} className="mt-1 whitespace-pre-line text-sm text-muted">{l}</p>
            ))}
            {renderDetails?.(open)}
            <button type="button" className="mt-4 w-full rounded-md border border-line py-2 text-sm font-medium" onClick={() => setOpen(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
