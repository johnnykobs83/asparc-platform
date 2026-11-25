'use client';

import { useMemo, useRef, useState } from 'react';
import { Button } from '../ui';

export interface CalendarAppointment {
  id: string;
  service_name: string;
  practitioner_id: string;
  practitioner_name: string;
  starts_at: string;
  ends_at: string;
  status: string;
  list_price_cents?: number | null;
  final_price_cents?: number | null;
  charge_cents?: number | null;
  customer: { full_name: string; email: string | null; phone: string | null } | null;
}
export interface CalendarPractitioner {
  id: string;
  name: string;
  active: boolean;
  weekly_hours: Record<string, { start: number; end: number }[]>;
  colour?: string | null;
}

/** Colours for practitioners who haven't picked one – the same order every time (by name). */
export const PRACTITIONER_COLOURS = ['#14519C', '#0E8C7F', '#D9822B', '#C2185B', '#6A4FB6', '#2E7D32', '#5D6D7E', '#B8860B'];
const isHex = (c: string | null | undefined): c is string => Boolean(c && /^#[0-9A-Fa-f]{6}$/.test(c));
/** Each practitioner's calendar colour: their chosen one, otherwise the next unused colour. */
export function practitionerColours(practitioners: Pick<CalendarPractitioner, 'id' | 'name' | 'colour'>[]): Map<string, string> {
  const out = new Map<string, string>();
  const taken = new Set(practitioners.map((p) => p.colour).filter(isHex).map((c) => c.toLowerCase()));
  const free = PRACTITIONER_COLOURS.filter((c) => !taken.has(c.toLowerCase()));
  let i = 0;
  for (const p of [...practitioners].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))) {
    out.set(p.id, isHex(p.colour) ? p.colour : (free[i++ % Math.max(free.length, 1)] ?? PRACTITIONER_COLOURS[i % PRACTITIONER_COLOURS.length]));
  }
  return out;
}
/** A see-through shade of a colour (8-digit hex). */
export const shade = (hex: string, alpha: string) => `${hex}${alpha}`;

const TZ = 'Australia/Melbourne';
const partsFmt = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const rangeFmt = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });

/** Melbourne calendar date and minutes-from-midnight for an instant. */
export function melbourneLocal(iso: string | Date) {
  const p = Object.fromEntries(partsFmt.formatToParts(typeof iso === 'string' ? new Date(iso) : iso).map((x) => [x.type, x.value]));
  return { ymd: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}
const asDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const addDays = (ymd: string, n: number) => new Date(asDate(ymd).getTime() + n * 86400000).toISOString().slice(0, 10);
/** Monday of the week containing a date. */
const mondayOf = (ymd: string) => addDays(ymd, -((asDate(ymd).getUTCDay() + 6) % 7));
export const clockLabel = (m: number) => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${m < 720 ? 'am' : 'pm'}`;
const hourLabel = (m: number) => clockLabel(m).replace(':00', '');
export const money = (cents: number | null | undefined) => (cents == null ? null : cents % 100 ? `$${(cents / 100).toFixed(2)}` : `$${cents / 100}`);

const ROW = 26; // pixels per 30 minutes
const SNAP = 15; // dragged bookings snap to quarter hours
/** Bookings are shaded in their practitioner's colour; the status changes how strong the shade is. */
const STATUS_STYLE: Record<string, { alpha: string; text: string; extra?: string }> = {
  confirmed: { alpha: '38', text: 'text-charcoal' },
  completed: { alpha: '14', text: 'text-charcoal/70' },
  no_show: { alpha: '14', text: 'text-warn', extra: 'border-dashed' },
  cancelled: { alpha: '00', text: 'text-danger line-through', extra: 'bg-white' },
};

/**
 * One page showing every day of a week, with each booking drawn at its time.
 * Confirmed bookings can be dragged to another day or time when `onMove` is given.
 */
export function WeekCalendar({
  appointments,
  practitioners,
  onSelect,
  onMove,
  onAdd,
}: {
  appointments: CalendarAppointment[];
  practitioners: CalendarPractitioner[];
  onSelect: (a: CalendarAppointment) => void;
  onMove?: (a: CalendarAppointment, date: string, minutes: number) => void;
  /** Staff add a booking: called with the day and start time clicked (or today when the button is used), and whose column was clicked. */
  onAdd?: (date: string, minutes: number, practitionerId?: string) => void;
}) {
  const today = melbourneLocal(new Date()).ymd;
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));
  const [showCancelled, setShowCancelled] = useState(false);
  /** 'all', or one practitioner: their hours and bookings only. */
  const [who, setWho] = useState<string>('all');
  const colours = useMemo(() => practitionerColours(practitioners), [practitioners]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const drag = useRef<{ a: CalendarAppointment; grabY: number; length: number } | null>(null);
  const [ghost, setGhost] = useState<{ date: string; minutes: number; length: number } | null>(null);

  const visible = useMemo(
    () =>
      appointments
        .filter((a) => showCancelled || a.status !== 'cancelled')
        .filter((a) => who === 'all' || a.practitioner_id === who)
        .map((a) => ({ a, s: melbourneLocal(a.starts_at), e: melbourneLocal(a.ends_at) }))
        .filter((x) => x.s.ymd >= days[0] && x.s.ymd <= days[6]),
    [appointments, days, showCancelled, who],
  );

  // The people shown: everyone active (plus anyone with bookings this week), or just the one picked.
  // In "All" each person gets their own strip in every day, shaded in their colour where they work.
  const people = useMemo(() => {
    const booked = new Set(visible.map((x) => x.a.practitioner_id));
    const all = [...practitioners].filter((p) => p.active || booked.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
    return who === 'all' ? all : practitioners.filter((p) => p.id === who);
  }, [practitioners, visible, who]);
  const strip = (id: string) => Math.max(0, people.findIndex((p) => p.id === id));
  const n = Math.max(people.length, 1);

  // Working hours of the people shown, per weekday – used to size the calendar.
  const open = useMemo(() => {
    const byDay: Record<number, { start: number; end: number }[]> = {};
    for (const p of people.filter((x) => x.active)) for (const [k, w] of Object.entries(p.weekly_hours ?? {})) (byDay[Number(k)] ??= []).push(...w);
    return byDay;
  }, [people]);

  // Show from the earliest to the latest working hour or booking that week (at least 8am–6pm).
  const [from, to] = useMemo(() => {
    let lo = 480;
    let hi = 1080;
    for (const w of Object.values(open).flat()) {
      lo = Math.min(lo, w.start);
      hi = Math.max(hi, w.end);
    }
    for (const x of visible) {
      lo = Math.min(lo, x.s.minutes);
      hi = Math.max(hi, x.e.ymd === x.s.ymd ? x.e.minutes : 1440);
    }
    return [Math.floor(lo / 60) * 60, Math.ceil(hi / 60) * 60];
  }, [open, visible]);

  const hours = Array.from({ length: (to - from) / 60 }, (_, i) => from + i * 60);
  const height = ((to - from) / 30) * ROW;
  const y = (m: number) => ((m - from) / 30) * ROW;
  const confirmed = visible.filter((x) => x.a.status === 'confirmed');
  const weekTotal = visible.filter((x) => x.a.status === 'confirmed' || x.a.status === 'completed').reduce((sum, x) => sum + (x.a.charge_cents ?? 0), 0);

  /** Start time (minutes from midnight) for a drop at this pointer position in a day column. */
  function dropMinutes(e: React.DragEvent<HTMLDivElement>): number | null {
    const d = drag.current;
    if (!d) return null;
    const top = e.currentTarget.getBoundingClientRect().top;
    const raw = from + ((e.clientY - top - d.grabY) / ROW) * 30;
    const snapped = Math.round(raw / SNAP) * SNAP;
    return Math.max(from, Math.min(to - d.length, snapped));
  }

  return (
    <div className="rounded-xl border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <p className="font-medium">
            {rangeFmt.format(asDate(days[0]))} – {rangeFmt.format(asDate(days[6]))}
          </p>
          <p className="text-xs text-muted">
            {confirmed.length} confirmed booking{confirmed.length === 1 ? '' : 's'} this week{weekTotal > 0 ? ` · ${money(weekTotal)} booked` : ''} · Melbourne time
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="mr-2 inline-flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" className="accent-royal" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> Show cancelled
          </label>
          {onAdd && <Button size="sm" onClick={() => onAdd(today >= days[0] && today <= days[6] ? today : days[0], 600, who === 'all' ? undefined : who)}>+ Add booking</Button>}
          <Button size="sm" variant="secondary" onClick={() => setWeekStart(addDays(weekStart, -7))}>← Previous</Button>
          <Button size="sm" variant="secondary" disabled={weekStart === mondayOf(today)} onClick={() => setWeekStart(mondayOf(today))}>This week</Button>
          <Button size="sm" variant="secondary" onClick={() => setWeekStart(addDays(weekStart, 7))}>Next →</Button>
        </div>
      </div>

      {practitioners.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2" role="radiogroup" aria-label="Practitioners">
          <button
            type="button"
            role="radio"
            aria-checked={who === 'all'}
            onClick={() => setWho('all')}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${who === 'all' ? 'border-charcoal bg-charcoal text-white' : 'border-line bg-white hover:border-charcoal'}`}
          >
            All
          </button>
          {[...practitioners]
            .filter((p) => p.active || appointments.some((a) => a.practitioner_id === p.id))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((p) => {
              const c = colours.get(p.id) ?? '#14519C';
              const picked = who === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={picked}
                  title={picked ? `Showing only ${p.name}` : `Show only ${p.name}'s hours and bookings`}
                  onClick={() => setWho(picked ? 'all' : p.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 text-xs font-medium transition ${who !== 'all' && !picked ? 'opacity-50 hover:opacity-100' : ''}`}
                  style={{ borderColor: picked ? c : shade(c, '66'), background: shade(c, picked ? '4d' : '1f') }}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} aria-hidden="true" />
                  {p.name}
                </button>
              );
            })}
        </div>
      )}

      <div className="overflow-x-auto">
        <div className="grid min-w-[860px]" style={{ gridTemplateColumns: '56px repeat(7, minmax(0, 1fr))' }}>
          <div className="border-b border-line" />
          {days.map((d) => (
            <div key={d} className={`border-b border-l border-line px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide ${d === today ? 'bg-royal text-white' : 'text-charcoal'}`}>
              {dayFmt.format(asDate(d))}
            </div>
          ))}

          <div className="relative" style={{ height }}>
            {hours.map((h) => (
              <span key={h} className="absolute right-1.5 -translate-y-1/2 text-[10px] text-muted" style={{ top: y(h) }}>
                {h === from ? '' : hourLabel(h)}
              </span>
            ))}
          </div>
          {days.map((d) => {
            const dayItems = visible.filter((x) => x.s.ymd === d).sort((p, q) => p.s.minutes - q.s.minutes);
            // Each person's bookings sit in their own strip, lined up with their shaded hours.
            return (
              <div
                key={d}
                data-day={d}
                onClick={(e) => {
                  // A click on empty space starts a new booking at that time (rounded to the half hour).
                  if (!onAdd || (e.target as HTMLElement).closest('button')) return;
                  const box = e.currentTarget.getBoundingClientRect();
                  const raw = from + ((e.clientY - box.top) / ROW) * 30;
                  const person = people[Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - box.left) / box.width) * n)))];
                  onAdd(d, Math.max(from, Math.min(to - 30, Math.floor(raw / 30) * 30)), person?.id);
                }}
                className={`relative border-l border-line bg-mist/60 ${onAdd ? 'cursor-cell' : ''}`}
                style={{ height }}
                onDragOver={(e) => {
                  const m = dropMinutes(e);
                  if (m === null) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (!ghost || ghost.date !== d || ghost.minutes !== m) setGhost({ date: d, minutes: m, length: drag.current!.length });
                }}
                onDrop={(e) => {
                  const m = dropMinutes(e);
                  const dragged = drag.current;
                  drag.current = null;
                  setGhost(null);
                  if (m === null || !dragged || !onMove) return;
                  e.preventDefault();
                  const was = melbourneLocal(dragged.a.starts_at);
                  if (was.ymd !== d || was.minutes !== m) onMove(dragged.a, d, m);
                }}
              >
                {people.map((p, k) =>
                  (p.active ? (p.weekly_hours?.[String(asDate(d).getUTCDay())] ?? []) : []).map((w, i) => {
                    const c = colours.get(p.id) ?? '#14519C';
                    return (
                      <div
                        key={`${p.id}-${i}`}
                        className="absolute"
                        title={`${p.name}: ${clockLabel(w.start)} – ${clockLabel(w.end)}`}
                        style={{
                          top: y(Math.max(w.start, from)),
                          height: y(Math.min(w.end, to)) - y(Math.max(w.start, from)),
                          left: `${(k * 100) / n}%`,
                          width: `${100 / n}%`,
                          background: `linear-gradient(${shade(c, '1f')}, ${shade(c, '1f')}), #fff`,
                          borderLeft: k > 0 ? `1px dashed ${shade(c, '55')}` : undefined,
                        }}
                      />
                    );
                  }),
                )}
                {hours.map((h) => (
                  <div key={h} className="absolute inset-x-0 border-t border-line/70" style={{ top: y(h) }} />
                ))}
                {ghost?.date === d && (
                  <div className="pointer-events-none absolute inset-x-0.5 z-10 rounded-md border-2 border-dashed border-royal bg-sky-100/80 px-1.5 py-1 text-[11px] font-semibold text-royal" style={{ top: y(ghost.minutes) + 1, height: Math.max((ghost.length / 30) * ROW - 2, 20) }}>
                    {clockLabel(ghost.minutes)}
                  </div>
                )}
                {dayItems.map(({ a, s, e }) => {
                  const end = e.ymd === s.ymd ? e.minutes : 1440;
                  const lane = strip(a.practitioner_id);
                  const width = 100 / n;
                  const movable = Boolean(onMove) && a.status === 'confirmed';
                  const price = money(a.charge_cents);
                  const discounted = a.final_price_cents != null && a.list_price_cents != null && a.final_price_cents !== a.list_price_cents;
                  const c = colours.get(a.practitioner_id) ?? '#14519C';
                  const st = STATUS_STYLE[a.status] ?? STATUS_STYLE.completed;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      draggable={movable}
                      onDragStart={(ev) => {
                        drag.current = { a, grabY: ev.clientY - ev.currentTarget.getBoundingClientRect().top, length: end - s.minutes };
                        ev.dataTransfer.effectAllowed = 'move';
                        ev.dataTransfer.setData('text/plain', a.id);
                      }}
                      onDragEnd={() => {
                        drag.current = null;
                        setGhost(null);
                      }}
                      onClick={() => onSelect(a)}
                      title={`${timeFmt.format(new Date(a.starts_at))} – ${timeFmt.format(new Date(a.ends_at))} · ${a.customer?.full_name ?? 'Customer'} · ${a.service_name} · ${a.practitioner_name}${price ? ` · ${price}${discounted ? ` (was ${money(a.list_price_cents)})` : ''}` : ''}${movable ? ' · drag to move' : ''}`}
                      className={`absolute overflow-hidden rounded-md border border-l-4 px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm hover:brightness-95 ${movable ? 'cursor-grab active:cursor-grabbing' : ''} ${st.text} ${st.extra ?? ''}`}
                      style={{ top: y(s.minutes) + 1, height: Math.max(y(end) - y(s.minutes) - 2, 20), left: `calc(${lane * width}% + 2px)`, width: `calc(${width}% - 4px)`, borderColor: shade(c, '66'), borderLeftColor: c, ...(a.status === 'cancelled' ? {} : { background: `linear-gradient(${shade(c, st.alpha)}, ${shade(c, st.alpha)}), #fff` }) }}
                    >
                      <span className="flex justify-between gap-1 font-semibold">
                        <span>{timeFmt.format(new Date(a.starts_at))}</span>
                        {price && <span data-price>{price}{discounted ? '*' : ''}</span>}
                      </span>
                      <span className="block truncate">{a.customer?.full_name ?? 'Customer'}</span>
                      <span className="block truncate opacity-80">{a.service_name}</span>
                      <span className="block truncate font-medium" style={{ color: a.status === 'cancelled' ? undefined : c }}>{a.practitioner_name}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <p className="border-t border-line px-4 py-2 text-xs text-muted">
        Each practitioner has their own colour. In <strong>All</strong>, every day has a strip per person, shaded where they work; click a name to see only their hours and bookings. A strong shade is booked, a pale shade is completed, dashed is a no-show; grey is closed. {onAdd ? 'Click an empty time to add a booking. ' : ''}{onMove ? 'Drag a confirmed booking to another day or time to move it. ' : ''}Click a booking for the customer&apos;s details, price and other changes. * marks an adjusted price.
      </p>
    </div>
  );
}
