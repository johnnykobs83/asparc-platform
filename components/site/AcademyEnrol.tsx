'use client';

import Link from 'next/link';
import { GST_REGISTERED, gstSuffix } from '@/lib/brand';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ACADEMY, ACADEMY_GROUPS, WEEKDAYS, WEEKDAYS_SHORT, ageOn, groupOf, groupsForAge, timeText, type AcademyGroupKey, type AcademyPackageKey } from '@/lib/academy/config';

interface Slot {
  id: string;
  group_key: AcademyGroupKey;
  weekday: number;
  start_minutes: number;
  end_minutes: number;
  places_left: number;
  full: boolean;
}
interface Pack {
  key: AcademyPackageKey;
  label: string;
  detail: string;
  sessions: number;
  price_cents: number | null;
  standard_price_cents: number | null;
  price_status: string | null;
  offer_label: string | null;
  available: boolean;
}
interface Data {
  term: string;
  venue: string;
  sessions: Slot[];
  packages: Pack[];
}
interface Done {
  reference: string;
  status: 'awaiting_payment' | 'waitlist';
  pay_url: string | null;
  price_cents: number | null;
}

const money = (c: number | null) => (c == null ? 'On enquiry' : `$${c % 100 ? (c / 100).toFixed(2) : (c / 100).toLocaleString('en-AU')}`);
const slotLabel = (s: Slot) => `${WEEKDAYS[s.weekday]} ${timeText(s.start_minutes)}–${timeText(s.end_minutes)}`;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(new Date());
const placesText = (s: Slot) => (s.full ? 'Full – join the waitlist' : s.places_left <= 3 ? `Only ${s.places_left} place${s.places_left === 1 ? '' : 's'} left` : `${s.places_left} places left`);

function Field({ id, label, required, error, hint, children }: { id: string; label: string; required?: boolean; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div data-error={error ? 'true' : undefined}>
      <label htmlFor={id} className="field-label">
        {label} {required && <span className="text-danger" aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

/** "8–11 Years" */
const yearsText = (ages: string) => `${ages} Years`;

/** Timetable, packages and the enrolment form for the Football Performance Academy page. */
export function AcademyEnrol() {
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [group, setGroup] = useState<AcademyGroupKey | ''>('');
  const [show, setShow] = useState<AcademyGroupKey | 'all'>('all');
  const [pack, setPack] = useState<AcademyPackageKey>('term_1x');
  const [picked, setPicked] = useState<string[]>([]);
  const [casualDate, setCasualDate] = useState('');
  const [f, setF] = useState({ parent_name: '', email: '', phone: '', athlete_name: '', athlete_dob: '', club: '', note: '', guardian_consent: false, consent_marketing: false, website: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [topError, setTopError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<Done | null>(null);

  const load = () =>
    fetch('/api/academy', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: Data) => setData(d))
      .catch(() => setLoadError(true));
  useEffect(() => {
    void load();
  }, []);

  const age = f.athlete_dob ? ageOn(f.athlete_dob, today()) : null;
  const ageGroups = groupsForAge(age);
  const pkg = data?.packages.find((p) => p.key === pack);
  const need = pkg?.sessions ?? 1;
  const groupSlots = useMemo(() => (data?.sessions ?? []).filter((s) => s.group_key === group), [data, group]);

  function chooseGroup(g: AcademyGroupKey) {
    setGroup(g);
    setPicked([]);
  }
  /** Clicking a session in the timetable picks its group and that session. */
  function pickFromTimetable(s: Slot) {
    if (group !== s.group_key) {
      setGroup(s.group_key);
      setPicked([s.id]);
    } else toggle(s.id);
    document.getElementById('enrol')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function toggle(id: string) {
    setPicked((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      const slot = data?.sessions.find((s) => s.id === id);
      // Two a week must be on two different days: swap out a same-day choice.
      const keep = need === 2 ? cur.filter((x) => data?.sessions.find((s) => s.id === x)?.weekday !== slot?.weekday) : [];
      return [...keep, id].slice(-need);
    });
  }
  function choosePack(k: AcademyPackageKey) {
    setPack(k);
    const n = data?.packages.find((p) => p.key === k)?.sessions ?? 1;
    setPicked((cur) => cur.slice(0, n));
  }

  // The casual-session date has to fall on the chosen session's weekday.
  const casualDays = useMemo(() => {
    const s = data?.sessions.find((x) => x.id === picked[0]);
    if (pack !== 'casual' || !s) return [];
    const out: string[] = [];
    const start = new Date(`${today()}T00:00:00Z`);
    for (let i = 1; i <= 120 && out.length < 12; i++) {
      const d = new Date(start.getTime() + i * 86400000);
      if (((d.getUTCDay() + 6) % 7) + 1 === s.weekday) out.push(d.toISOString().slice(0, 10));
    }
    return out;
  }, [data, picked, pack]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setErrors({});
    setTopError(null);
    try {
      const r = await fetch('/api/academy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...f,
          club: f.club || undefined,
          note: f.note || undefined,
          website: f.website || undefined,
          group_key: group || undefined,
          package: pack,
          session_ids: picked,
          casual_date: pack === 'casual' ? casualDate || undefined : undefined,
        }),
      });
      const body = (await r.json().catch(() => ({}))) as Done & { error?: string; fields?: Record<string, string> };
      if (!r.ok) {
        setErrors(body.fields ?? {});
        setTopError(body.fields && Object.keys(body.fields).length ? 'Please check the answers marked in red.' : body.error ?? 'Something went wrong. Please try again.');
        requestAnimationFrame(() => document.querySelector('#enrol [data-error="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        return;
      }
      setDone(body);
      void load();
      document.getElementById('enrol')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      setTopError('Something went wrong. Please check your connection and try again.');
    } finally {
      setSending(false);
    }
  }

  if (loadError) return <p className="container-x py-10 text-danger">The timetable couldn’t load. Please refresh the page, or contact us to enrol.</p>;

  return (
    <>
      {/* TIMETABLE */}
      <section id="timetable" className="scroll-mt-24 bg-mist py-20 sm:py-24">
        <div className="container-x">
          <p className="eyebrow mb-3 text-royal">Weekly timetable · {ACADEMY.term}</p>
          <h2 className="text-balance text-4xl uppercase leading-[0.95] sm:text-5xl">Pick the days that suit you</h2>
          <p className="mt-4 max-w-2xl text-lg text-muted">Every session is 50 minutes at {ACADEMY.venue}, with no more than {ACADEMY.capacity} athletes. Tap a session to start your enrolment.</p>
          <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Show sessions for">
            {[{ key: 'all' as const, name: 'All groups', ages: '', colour: '#101820' }, ...ACADEMY_GROUPS].map((g) => {
              const on = show === g.key;
              return (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => setShow(g.key)}
                  aria-pressed={on}
                  className={`inline-flex items-center gap-2 rounded-full border-2 px-4 py-1.5 text-sm font-semibold transition ${on ? 'text-white shadow' : 'bg-white hover:brightness-95'}`}
                  style={{ borderColor: g.colour, background: on ? g.colour : undefined }}
                >
                  {g.key !== 'all' && <span className="h-3 w-3 rounded-full border border-white/60" style={{ background: g.colour }} aria-hidden="true" />}
                  {g.name}
                  {g.ages && <span className={on ? 'text-white/85' : 'text-muted'}>· {yearsText(g.ages)}</span>}
                </button>
              );
            })}
          </div>
          {!data ? (
            <p className="mt-8 animate-pulse text-muted">Loading the timetable…</p>
          ) : (
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {[1, 2, 3, 4, 5, 6].map((wd) => (
                <div key={wd} className="rounded-xl border border-line bg-white p-3">
                  <h3 className="mb-2 font-display text-xl font-bold uppercase">{WEEKDAYS[wd]}</h3>
                  <ul className="space-y-2">
                    {data.sessions.filter((s) => s.weekday === wd && (show === 'all' || s.group_key === show)).length === 0 && (
                      <li className="px-1 py-2 text-sm text-muted">No sessions</li>
                    )}
                    {data.sessions
                      .filter((s) => s.weekday === wd && (show === 'all' || s.group_key === show))
                      .map((s) => {
                        const g = groupOf(s.group_key)!;
                        const on = picked.includes(s.id);
                        return (
                          <li key={s.id}>
                            <button
                              type="button"
                              onClick={() => pickFromTimetable(s)}
                              className={`w-full rounded-lg border-l-[6px] px-3 py-2 text-left transition ${on ? 'ring-2 ring-charcoal' : 'hover:brightness-95'}`}
                              style={{ borderLeftColor: g.colour, background: `${g.colour}1f` }}
                              aria-pressed={on}
                            >
                              <span className="block text-sm font-semibold">{timeText(s.start_minutes)}–{timeText(s.end_minutes)}</span>
                              <span className="block text-sm">{g.name}</span>
                              <span className="block text-xs text-muted">{yearsText(g.ages)}</span>
                              <span className={`mt-1 block text-xs font-semibold ${s.full ? 'text-danger' : s.places_left <= 3 ? 'text-warn' : 'text-success'}`}>{placesText(s)}</span>
                            </button>
                          </li>
                        );
                      })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* PACKAGES */}
      <section id="packages" className="scroll-mt-24 py-20 sm:py-24">
        <div className="container-x">
          <p className="eyebrow mb-3 text-royal">Packages</p>
          <h2 className="text-balance text-4xl uppercase leading-[0.95] sm:text-5xl">Choose how often</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(data?.packages ?? []).map((p) => {
              const special = p.standard_price_cents != null && p.price_cents != null && p.standard_price_cents > p.price_cents;
              const on = pack === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  disabled={!p.available}
                  onClick={() => {
                    choosePack(p.key);
                    document.getElementById('enrol')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className={`card flex flex-col p-6 text-left transition disabled:opacity-50 ${on ? 'ring-2 ring-royal' : 'hover:border-royal'}`}
                >
                  {special && <span className="mb-2 self-start rounded-full bg-royal px-2.5 py-0.5 font-display text-xs font-bold uppercase tracking-wider text-white">{p.offer_label || 'Special'}</span>}
                  <span className="font-display text-2xl font-bold uppercase leading-tight">{p.label}</span>
                  <span className="text-sm text-muted">{p.detail}</span>
                  <span className="mt-4 font-display text-4xl font-extrabold text-royal">
                    {money(p.price_cents)}
                    {special && <s className="ml-2 text-xl font-semibold text-muted">{money(p.standard_price_cents)}</s>}
                  </span>
                  {GST_REGISTERED && <span className="text-xs text-muted">incl. GST</span>}
                  {p.price_status === 'draft' && <span className="mt-2 text-xs text-warn">Draft price – subject to confirmation</span>}
                  <span className={`mt-5 inline-flex justify-center rounded-md px-3 py-2 text-sm font-semibold ${on ? 'bg-royal text-white' : 'border border-line'}`}>{on ? 'Selected' : 'Choose'}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ENROL */}
      <section id="enrol" className="scroll-mt-24 bg-mist py-20 sm:py-24">
        <div className="container-x grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <p className="eyebrow mb-3 text-royal">For parents &amp; guardians</p>
            <h2 className="text-balance text-4xl uppercase leading-[0.95] sm:text-5xl">Enrol now</h2>
            <ul className="mt-6 space-y-3 text-[15px] text-muted">
              <li>✓ Places are held as soon as you enrol</li>
              <li>✓ If a session is full you’ll go on the waitlist – nothing to pay until a place opens</li>
              <li>✓ We’ll send a short health form to fill in before the first session</li>
              <li>
                ✓ Questions? <Link href="/contact" className="text-royal underline">Contact us</Link>
              </li>
            </ul>
          </div>
          <div className="card p-6 sm:p-8 lg:col-span-8">
            {done ? (
              <div className="space-y-3">
                <h3 className="text-2xl uppercase text-royal">{done.status === 'waitlist' ? 'You’re on the waitlist' : 'Enrolment received'}</h3>
                <p>
                  Reference <strong>{done.reference}</strong>.{' '}
                  {done.status === 'waitlist'
                    ? 'That session is full right now. We’ll contact you as soon as a place opens up or to offer another session – nothing is payable yet.'
                    : 'Your child’s place is held. We’ve emailed you the details.'}
                </p>
                {done.status !== 'waitlist' &&
                  (done.pay_url ? (
                    <a href={done.pay_url} className="btn-primary">
                      Pay {money(done.price_cents)} and confirm the place
                    </a>
                  ) : (
                    <p>We’ll send you the payment details shortly to confirm the place.</p>
                  ))}
                <button type="button" className="text-sm text-royal underline" onClick={() => { setDone(null); setPicked([]); setF((x) => ({ ...x, athlete_name: '', athlete_dob: '', note: '' })); }}>
                  Enrol another child
                </button>
              </div>
            ) : (
              <form onSubmit={submit} noValidate className="space-y-6">
                <div className="hidden" aria-hidden="true">
                  <label>
                    Website <input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
                  </label>
                </div>
                <fieldset className="space-y-4">
                  <legend className="font-display text-xl font-bold uppercase">1. Your child</legend>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field id="athlete_name" label="Child’s full name" required error={errors.athlete_name}>
                      <input id="athlete_name" className="field" value={f.athlete_name} onChange={(e) => setF({ ...f, athlete_name: e.target.value })} />
                    </Field>
                    <Field id="athlete_dob" label="Date of birth" required error={errors.athlete_dob} hint={age != null ? `Age ${age} – ${ageGroups.length ? ageGroups.map((g) => g.name).join(' or ') : 'outside the Academy age groups (8–16)'}` : undefined}>
                      <input id="athlete_dob" type="date" className="field" value={f.athlete_dob} onChange={(e) => setF({ ...f, athlete_dob: e.target.value })} />
                    </Field>
                  </div>
                  <Field id="club" label="Club or school (optional)" error={errors.club}>
                    <input id="club" className="field" value={f.club} onChange={(e) => setF({ ...f, club: e.target.value })} />
                  </Field>
                </fieldset>

                <fieldset className="space-y-3" data-error={errors.group_key ? 'true' : undefined}>
                  <legend className="font-display text-xl font-bold uppercase">2. Group</legend>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {ACADEMY_GROUPS.map((g) => {
                      const fits = age == null || ageGroups.some((x) => x.key === g.key);
                      return (
                        <label key={g.key} className={`flex cursor-pointer flex-col rounded-lg border-2 p-3 ${group === g.key ? '' : 'border-line'} ${fits ? '' : 'opacity-40'}`} style={group === g.key ? { borderColor: g.colour, background: `${g.colour}14` } : undefined}>
                          <input type="radio" name="group" className="sr-only" checked={group === g.key} onChange={() => chooseGroup(g.key)} />
                          <span className="font-semibold">{g.name}</span>
                          <span className="text-sm text-muted">{yearsText(g.ages)}</span>
                        </label>
                      );
                    })}
                  </div>
                  {errors.group_key && <p className="text-xs font-medium text-danger">{errors.group_key}</p>}
                </fieldset>

                <fieldset className="space-y-3">
                  <legend className="font-display text-xl font-bold uppercase">3. Package</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(data?.packages ?? []).map((p) => (
                      <label key={p.key} className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border-2 p-3 ${pack === p.key ? 'border-royal bg-sky-100/40' : 'border-line'} ${p.available ? '' : 'opacity-40'}`}>
                        <input type="radio" name="package" className="sr-only" disabled={!p.available} checked={pack === p.key} onChange={() => choosePack(p.key)} />
                        <span>
                          <span className="block font-semibold">{p.label}</span>
                          <span className="block text-sm text-muted">{p.detail}</span>
                        </span>
                        <span className="font-display text-2xl font-bold">{money(p.price_cents)}</span>
                      </label>
                    ))}
                  </div>
                  {errors.package && <p className="text-xs font-medium text-danger">{errors.package}</p>}
                </fieldset>

                <fieldset className="space-y-3" data-error={errors.session_ids || errors.casual_date ? 'true' : undefined}>
                  <legend className="font-display text-xl font-bold uppercase">4. {need === 2 ? 'Two sessions a week' : pack === 'casual' ? 'Session and date' : 'Session'}</legend>
                  {!group ? (
                    <p className="text-sm text-muted">Choose a group first.</p>
                  ) : (
                    <>
                      <p className="text-sm text-muted">{need === 2 ? 'Choose two, on different days.' : 'Choose one.'}</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {groupSlots.map((s) => {
                          const on = picked.includes(s.id);
                          return (
                            <label key={s.id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border-2 p-3 ${on ? 'border-royal bg-sky-100/40' : 'border-line'}`}>
                              <input type={need === 2 ? 'checkbox' : 'radio'} name="session" className="sr-only" checked={on} onChange={() => toggle(s.id)} />
                              <span className="font-medium">{slotLabel(s)}</span>
                              <span className={`text-xs font-semibold ${s.full ? 'text-danger' : s.places_left <= 3 ? 'text-warn' : 'text-success'}`}>{s.full ? 'Waitlist' : `${s.places_left} left`}</span>
                            </label>
                          );
                        })}
                      </div>
                      {pack === 'casual' && picked[0] && (
                        <Field id="casual_date" label="Date" required error={errors.casual_date}>
                          <select id="casual_date" className="field" value={casualDate} onChange={(e) => setCasualDate(e.target.value)}>
                            <option value="">Choose a date</option>
                            {casualDays.map((d) => (
                              <option key={d} value={d}>
                                {new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${d}T00:00:00Z`))}
                              </option>
                            ))}
                          </select>
                        </Field>
                      )}
                      {errors.session_ids && <p className="text-xs font-medium text-danger">{errors.session_ids}</p>}
                    </>
                  )}
                </fieldset>

                <fieldset className="space-y-4">
                  <legend className="font-display text-xl font-bold uppercase">5. Parent or guardian</legend>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field id="parent_name" label="Your full name" required error={errors.parent_name}>
                      <input id="parent_name" className="field" autoComplete="name" value={f.parent_name} onChange={(e) => setF({ ...f, parent_name: e.target.value })} />
                    </Field>
                    <Field id="phone" label="Mobile" required error={errors.phone}>
                      <input id="phone" type="tel" className="field" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
                    </Field>
                  </div>
                  <Field id="email" label="Email" required error={errors.email}>
                    <input id="email" type="email" className="field" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
                  </Field>
                  <Field id="note" label="Anything we should know? (optional)" hint="Please don’t include medical details here – the health form covers that." error={errors.note}>
                    <textarea id="note" rows={3} className="field" maxLength={1000} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
                  </Field>
                  <label className="flex items-start gap-3" data-error={errors.guardian_consent ? 'true' : undefined}>
                    <input type="checkbox" className="mt-1 accent-royal" checked={f.guardian_consent} onChange={(e) => setF({ ...f, guardian_consent: e.target.checked })} />
                    <span className="text-[15px]">
                      I’m the parent or guardian and I agree to enrol my child, and to ASPARC using these details for the Academy as set out in the <Link href="/privacy-policy" className="text-royal underline">Privacy Policy</Link>. <span className="text-danger">*</span>
                      {errors.guardian_consent && <span className="block text-xs font-medium text-danger">{errors.guardian_consent}</span>}
                    </span>
                  </label>
                  <label className="flex items-start gap-3">
                    <input type="checkbox" className="mt-1 accent-royal" checked={f.consent_marketing} onChange={(e) => setF({ ...f, consent_marketing: e.target.checked })} />
                    <span className="text-[15px]">Send me Academy news, programs and offers. <span className="text-muted">(optional)</span></span>
                  </label>
                </fieldset>

                {pkg && (
                  <p className="rounded-lg bg-mist px-4 py-3 text-sm">
                    <strong>{pkg.label}</strong> – {pkg.detail}: <strong>{money(pkg.price_cents)}</strong>{gstSuffix()}
                    {picked.length > 0 && <> · {picked.map((id) => data?.sessions.find((s) => s.id === id)).filter(Boolean).map((s) => `${WEEKDAYS_SHORT[s!.weekday]} ${timeText(s!.start_minutes)}`).join(' & ')}</>}
                  </p>
                )}
                {topError && (
                  <p role="alert" className="rounded-md border border-danger/30 bg-[#fdecea] px-4 py-3 text-sm text-danger">
                    {topError}
                  </p>
                )}
                <button type="submit" className="btn-primary w-full sm:w-auto" disabled={sending}>
                  {sending ? 'Sending…' : 'Enrol now'}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
