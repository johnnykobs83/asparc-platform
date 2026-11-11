'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface BookableService {
  id: string;
  name: string;
  summary: string;
  duration_minutes: number;
  price_cents: number | null;
  price_status: 'draft' | 'approved' | 'on_enquiry';
  practitioners: { id: string; name: string; title: string | null }[];
}
interface Slot {
  start: string;
  practitioner_id: string;
}
interface Availability {
  from: string;
  days: { date: string; slots: Slot[] }[];
  rules: { lastDate: string };
}
interface Confirmation {
  reference: string;
  when: string;
  service: string;
  practitioner: string;
  price_cents?: number | null;
}

const TZ = 'Australia/Melbourne';
const timeFmt = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'short' });
const dateFmt = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const longFmt = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
const asDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const addDays = (ymd: string, n: number) => new Date(asDate(ymd).getTime() + n * 86400000).toISOString().slice(0, 10);

function price(s: BookableService) {
  if (s.price_status === 'on_enquiry' || s.price_cents == null) return 'Price on enquiry';
  const d = s.price_cents / 100;
  const amount = Number.isInteger(d) ? `$${d}` : `$${d.toFixed(2)}`;
  return s.price_status === 'draft' ? `${amount} (draft pricing – subject to confirmation)` : amount;
}

const step = 'font-display text-2xl font-bold uppercase';
const choice = (active: boolean) =>
  `rounded-lg border px-4 py-3 text-left text-sm transition ${active ? 'border-royal bg-royal text-white' : 'border-line bg-white hover:border-royal'}`;

export function BookingFlow() {
  const [services, setServices] = useState<BookableService[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [serviceId, setServiceId] = useState('');
  const [practitionerId, setPractitionerId] = useState('');
  const [from, setFrom] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [date, setDate] = useState('');
  const [start, setStart] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'sending'>('idle');
  const [done, setDone] = useState<Confirmation | null>(null);

  useEffect(() => {
    fetch('/api/bookings', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { services?: BookableService[] }) => {
        const list = d.services ?? [];
        setServices(list);
        const wanted = new URLSearchParams(window.location.search).get('service');
        const match = list.find((s) => s.id === wanted || s.name === wanted);
        if (match) setServiceId(match.id);
        else if (list.length === 1) setServiceId(list[0].id);
      })
      .catch(() => setLoadError(true));
  }, []);

  const service = useMemo(() => services?.find((s) => s.id === serviceId) ?? null, [services, serviceId]);

  const loadSlots = useCallback(async () => {
    if (!serviceId) return;
    setLoadingSlots(true);
    try {
      const q = new URLSearchParams({ service: serviceId, days: '7' });
      if (from) q.set('from', from);
      if (practitionerId) q.set('practitioner', practitionerId);
      const r = await fetch(`/api/bookings/availability?${q}`, { cache: 'no-store' });
      const a = (await r.json()) as Availability;
      if (!r.ok) throw new Error('unavailable');
      setAvailability(a);
      setDate((current) => (a.days.some((d) => d.date === current && d.slots.length) ? current : (a.days.find((d) => d.slots.length)?.date ?? a.days[0]?.date ?? '')));
    } catch {
      setAvailability(null);
    } finally {
      setLoadingSlots(false);
    }
  }, [serviceId, practitionerId, from]);

  useEffect(() => {
    setStart('');
    void loadSlots();
  }, [loadSlots]);

  // One button per start time, even when several practitioners are free then.
  const times = useMemo(() => {
    const day = availability?.days.find((d) => d.date === date);
    return [...new Set((day?.slots ?? []).map((s) => s.start))];
  }, [availability, date]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!service || !start || state === 'sending') return;
    const f = new FormData(e.currentTarget);
    setState('sending');
    setErrors({});
    setMessage('');
    try {
      const r = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: service.id,
          practitioner_id: practitionerId || null,
          start,
          full_name: f.get('full_name'),
          email: f.get('email'),
          phone: f.get('phone'),
          notes: f.get('notes') || undefined,
          consent_contact: f.get('consent_contact') === 'on',
          consent_marketing: f.get('consent_marketing') === 'on',
          website: f.get('website') || undefined,
        }),
      });
      const body = (await r.json()) as Confirmation & { error?: string; fields?: Record<string, string> };
      if (r.ok && body.reference) {
        setDone(body);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      setErrors(body.fields ?? {});
      setMessage(body.error ?? 'Something went wrong. Please try again.');
      if (r.status === 409) {
        setStart('');
        void loadSlots();
      }
    } catch {
      setMessage('We could not reach the server. Please check your connection and try again.');
    } finally {
      setState('idle');
    }
  }

  if (done) {
    return (
      <div className="card p-6 sm:p-8" role="status">
        <p className="eyebrow !text-success">Booking confirmed</p>
        <h2 className="mt-2 font-display text-4xl font-extrabold uppercase">You&apos;re booked in.</h2>
        <dl className="mt-6 grid gap-3 text-[15px]">
          <div><dt className="text-xs uppercase tracking-wider text-muted">Service</dt><dd className="font-semibold">{done.service}</dd></div>
          <div><dt className="text-xs uppercase tracking-wider text-muted">When</dt><dd className="font-semibold">{done.when}</dd></div>
          <div><dt className="text-xs uppercase tracking-wider text-muted">With</dt><dd className="font-semibold">{done.practitioner}</dd></div>
          {done.price_cents != null && <div><dt className="text-xs uppercase tracking-wider text-muted">Price</dt><dd className="font-semibold">${done.price_cents % 100 ? (done.price_cents / 100).toFixed(2) : done.price_cents / 100}</dd></div>}
          <div><dt className="text-xs uppercase tracking-wider text-muted">Reference</dt><dd className="font-semibold">{done.reference}</dd></div>
        </dl>
        <p className="mt-6 text-sm text-muted">
          Your time is reserved and no further confirmation is needed. No payment has been taken online. If you need to change or cancel, please <Link href="/contact" className="text-royal underline">contact us</Link>.
        </p>
      </div>
    );
  }

  if (loadError) return <p className="card p-6 text-sm">We could not load online bookings. Please <Link href="/contact?form=booking" className="text-royal underline">send a booking request</Link> instead.</p>;
  if (!services) return <p className="card p-6 text-sm text-muted">Loading available services…</p>;
  if (!services.length) {
    return (
      <div className="card p-6 sm:p-8">
        <h2 className={step}>Online booking is not open yet</h2>
        <p className="mt-3 text-[15px] text-muted">You can still request a time and the ASPARC team will arrange it with you.</p>
        <Link href="/contact?form=booking" className="btn-primary mt-6">Send a booking request</Link>
      </div>
    );
  }

  const lastDate = availability?.rules.lastDate ?? '';
  const canGoBack = Boolean(availability && from && availability.from > new Date().toISOString().slice(0, 10));
  const canGoForward = Boolean(availability && addDays(availability.from, 7) <= lastDate);

  return (
    <div className="grid gap-8">
      <section className="card p-6 sm:p-8" aria-labelledby="bk-service">
        <h2 id="bk-service" className={step}>1. Choose a service</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {services.map((s) => (
            <button key={s.id} type="button" aria-pressed={s.id === serviceId} className={choice(s.id === serviceId)} onClick={() => { setServiceId(s.id); setPractitionerId(''); setFrom(null); }}>
              <span className="block font-semibold">{s.name}</span>
              <span className={`mt-0.5 block text-xs ${s.id === serviceId ? 'text-white/80' : 'text-muted'}`}>{s.duration_minutes} minutes · {price(s)}</span>
            </button>
          ))}
        </div>
      </section>

      {service && service.practitioners.length > 1 && (
        <section className="card p-6 sm:p-8" aria-labelledby="bk-who">
          <h2 id="bk-who" className={step}>2. Choose a practitioner</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" aria-pressed={!practitionerId} className={choice(!practitionerId)} onClick={() => setPractitionerId('')}>Any available</button>
            {service.practitioners.map((p) => (
              <button key={p.id} type="button" aria-pressed={p.id === practitionerId} className={choice(p.id === practitionerId)} onClick={() => setPractitionerId(p.id)}>
                <span className="block font-semibold">{p.name}</span>
                {p.title && <span className={`block text-xs ${p.id === practitionerId ? 'text-white/80' : 'text-muted'}`}>{p.title}</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {service && (
        <section className="card p-6 sm:p-8" aria-labelledby="bk-when">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="bk-when" className={step}>{service.practitioners.length > 1 ? '3' : '2'}. Choose a time</h2>
            <div className="flex gap-2">
              <button type="button" className="rounded-md border border-line px-3 py-1.5 text-sm disabled:opacity-40" disabled={!canGoBack || loadingSlots} onClick={() => setFrom(addDays(availability!.from, -7))}>← Earlier</button>
              <button type="button" className="rounded-md border border-line px-3 py-1.5 text-sm disabled:opacity-40" disabled={!canGoForward || loadingSlots} onClick={() => setFrom(addDays(availability!.from, 7))}>Later →</button>
            </div>
          </div>
          {service.practitioners.length === 1 && <p className="mt-1 text-sm text-muted">With {service.practitioners[0].name}{service.practitioners[0].title ? `, ${service.practitioners[0].title}` : ''}</p>}
          {!availability && loadingSlots && <p className="mt-4 text-sm text-muted">Loading available times…</p>}
          {!availability && !loadingSlots && <p className="mt-4 text-sm text-danger">We could not load times. Please try again.</p>}
          {availability && (
            <>
              <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7" role="group" aria-label="Day">
                {availability.days.map((d) => (
                  <button key={d.date} type="button" aria-pressed={d.date === date} disabled={!d.slots.length} onClick={() => { setDate(d.date); setStart(''); }} className={`${choice(d.date === date)} !px-2 text-center disabled:cursor-not-allowed disabled:opacity-40`}>
                    <span className="block text-xs uppercase">{dayFmt.format(asDate(d.date))}</span>
                    <span className="block font-semibold">{dateFmt.format(asDate(d.date))}</span>
                  </button>
                ))}
              </div>
              <p className="mt-5 text-sm font-medium" aria-live="polite">
                {date ? longFmt.format(asDate(date)) : ''} {times.length ? '' : '– no times available. Try another day or a later week.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Start time">
                {times.map((t) => (
                  <button key={t} type="button" aria-pressed={t === start} onClick={() => setStart(t)} className={`${choice(t === start)} !py-2`}>{timeFmt.format(new Date(t))}</button>
                ))}
              </div>
              <p className="mt-4 text-xs text-muted">Times are shown in Melbourne time.</p>
            </>
          )}
        </section>
      )}

      {service && start && (
        <form onSubmit={submit} noValidate className="card relative grid gap-5 p-6 sm:p-8" aria-labelledby="bk-you">
          <h2 id="bk-you" className={step}>{service.practitioners.length > 1 ? '4' : '3'}. Your details</h2>
          <p className="rounded-md bg-mist px-4 py-3 text-sm">
            <strong>{service.name}</strong> · {longFmt.format(asDate(date))} at {timeFmt.format(new Date(start))}
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="bk-name" className="field-label">Full name <span className="text-danger">*</span></label>
              <input id="bk-name" name="full_name" className="field" autoComplete="name" aria-invalid={!!errors.full_name} />
              {errors.full_name && <p className="mt-1 text-xs font-medium text-danger">{errors.full_name}</p>}
            </div>
            <div>
              <label htmlFor="bk-email" className="field-label">Email <span className="text-danger">*</span></label>
              <input id="bk-email" name="email" type="email" className="field" autoComplete="email" aria-invalid={!!errors.email} />
              {errors.email && <p className="mt-1 text-xs font-medium text-danger">{errors.email}</p>}
            </div>
            <div>
              <label htmlFor="bk-phone" className="field-label">Mobile <span className="text-danger">*</span></label>
              <input id="bk-phone" name="phone" type="tel" className="field" autoComplete="tel" aria-invalid={!!errors.phone} />
              {errors.phone && <p className="mt-1 text-xs font-medium text-danger">{errors.phone}</p>}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="bk-notes" className="field-label">Anything we should know? (optional)</label>
              <textarea id="bk-notes" name="notes" rows={3} maxLength={1000} className="field resize-y" />
              <p className="mt-1 text-xs text-muted">Please don&apos;t include medical or injury details here – we&apos;ll discuss anything relevant with you directly.</p>
            </div>
          </div>
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label>Website <input name="website" tabIndex={-1} autoComplete="off" /></label>
          </div>
          <fieldset className="grid gap-2.5 text-sm">
            <legend className="sr-only">Consent</legend>
            <label className="flex items-start gap-2.5">
              <input type="checkbox" name="consent_contact" className="mt-0.5 h-4 w-4 accent-royal" />
              <span>
                I agree to ASPARC contacting me about this booking, as described in the <Link href="/privacy-policy" className="text-royal underline" target="_blank">Privacy Policy</Link>, and I accept the <Link href="/terms-and-conditions" className="text-royal underline" target="_blank">cancellation policy</Link>. <span className="text-danger">*</span>
                {errors.consent_contact && <span className="block text-xs font-medium text-danger">{errors.consent_contact}</span>}
              </span>
            </label>
            <label className="flex items-start gap-2.5 text-muted">
              <input type="checkbox" name="consent_marketing" className="mt-0.5 h-4 w-4 accent-royal" />
              <span>Optional: send me ASPARC news and program updates. You can unsubscribe at any time.</span>
            </label>
          </fieldset>
          {message && <p role="alert" className="rounded-md bg-[#fdecea] px-3 py-2 text-sm font-medium text-danger">{message}</p>}
          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" className="btn-primary" disabled={state === 'sending'}>{state === 'sending' ? 'Booking…' : 'Confirm booking'}</button>
            <p className="text-xs text-muted">No payment is taken online. Your time is confirmed straight away.</p>
          </div>
        </form>
      )}
    </div>
  );
}
