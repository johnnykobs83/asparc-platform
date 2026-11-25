'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { CONSENT_HEALTH_TEXT, CONSENT_MARKETING_TEXT, CONSENT_RISK_TEXT, HEARD_ABOUT, SCREENING_QUESTIONS } from '@/lib/clients/screening';

type Loaded =
  | { state: 'open'; recheck: boolean; next_visit: string | null; prefill: { full_name: string; email: string; phone: string; sport: string; club: string; consent_marketing: boolean } }
  | { state: 'submitted' | 'expired' };

interface Values {
  for_whom: '' | 'self' | 'child';
  full_name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  athlete_name: string;
  athlete_dob: string;
  address: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  sport: string;
  club: string;
  goals: string;
  heard_about: string;
  screening: Record<string, boolean | undefined>;
  screening_details: string;
  injuries: string;
  medications: string;
  allergies: string;
  other_health: string;
  consent_health: boolean;
  consent_risk: boolean;
  consent_marketing: boolean;
  signature_name: string;
  website: string;
}

const empty: Values = {
  for_whom: '',
  full_name: '',
  email: '',
  phone: '',
  date_of_birth: '',
  athlete_name: '',
  athlete_dob: '',
  address: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  sport: '',
  club: '',
  goals: '',
  heard_about: '',
  screening: {},
  screening_details: '',
  injuries: '',
  medications: '',
  allergies: '',
  other_health: '',
  consent_health: false,
  consent_risk: false,
  consent_marketing: false,
  signature_name: '',
  website: '',
};

function Field({ id, label, required, hint, error, children }: { id: string; label: string; required?: boolean; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label} {required && <span className="text-danger" aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

function Card({ n, title, intro, children }: { n: number; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="card p-5 sm:p-7">
      <legend className="sr-only">{title}</legend>
      <h2 className="flex items-baseline gap-3 text-xl uppercase">
        <span className="font-display text-sky">{String(n).padStart(2, '0')}</span> {title}
      </h2>
      {intro && <p className="mt-2 text-sm text-muted">{intro}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </fieldset>
  );
}

export function PreVisitForm({ token }: { token: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [v, setV] = useState<Values>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ needs_review: boolean } | null>(null);
  const [topError, setTopError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/intake/${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async (r) => {
        const body = (await r.json()) as Loaded & { error?: string };
        if (!r.ok) throw new Error(body.error ?? 'This form could not be loaded.');
        setLoaded(body);
        if (body.state === 'open') setV((x) => ({ ...x, ...body.prefill }));
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, [token]);

  const set = (p: Partial<Values>) => setV((x) => ({ ...x, ...p }));
  const anyYes = SCREENING_QUESTIONS.some((q) => v.screening[q.key] === true);
  const child = v.for_whom === 'child';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setErrors({});
    setTopError(null);
    const opt = (s: string) => s.trim() || undefined;
    try {
      const r = await fetch(`/api/intake/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          for_whom: v.for_whom || undefined,
          full_name: v.full_name,
          email: opt(v.email),
          phone: v.phone,
          date_of_birth: !child ? opt(v.date_of_birth) : undefined,
          athlete_name: child ? opt(v.athlete_name) : undefined,
          athlete_dob: child ? opt(v.athlete_dob) : undefined,
          address: opt(v.address),
          emergency_contact_name: v.emergency_contact_name,
          emergency_contact_phone: v.emergency_contact_phone,
          sport: opt(v.sport),
          club: opt(v.club),
          goals: opt(v.goals),
          heard_about: opt(v.heard_about),
          screening: v.screening,
          screening_details: opt(v.screening_details),
          injuries: opt(v.injuries),
          medications: opt(v.medications),
          allergies: opt(v.allergies),
          other_health: opt(v.other_health),
          consent_health: v.consent_health,
          consent_risk: v.consent_risk,
          consent_marketing: v.consent_marketing,
          signature_name: v.signature_name,
          website: v.website || undefined,
        }),
      });
      const body = (await r.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string>; needs_review?: boolean };
      if (!r.ok) {
        const fields = body.fields ?? {};
        setErrors(fields);
        setTopError(Object.keys(fields).length ? 'Please check the answers marked in red.' : body.error ?? 'Something went wrong. Please try again.');
        requestAnimationFrame(() => document.querySelector('[data-error="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        return;
      }
      setDone({ needs_review: Boolean(body.needs_review) });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setTopError('Something went wrong. Please check your connection and try again.');
    } finally {
      setSending(false);
    }
  }

  if (loadError) return <p className="card mt-8 p-6 text-danger">{loadError}</p>;
  if (!loaded) return <p className="card mt-8 animate-pulse p-6 text-muted">Loading your form…</p>;
  if (done) {
    return (
      <div className="card mt-8 space-y-3 p-6 sm:p-8">
        <h2 className="text-2xl uppercase text-royal">Thank you – that&apos;s all done</h2>
        <p>Your form has been sent securely to the ASPARC team.</p>
        {done.needs_review && (
          <p>
            Because you answered “yes” to at least one health question, one of our team will look at your answers before your session. We may contact you, and we might ask you to check with your doctor before you start. This is a normal step and helps us keep you safe.
          </p>
        )}
        <p className="text-sm text-muted">If anything changes before your visit, just let us know.</p>
      </div>
    );
  }
  if (loaded.state !== 'open') {
    return loaded.state === 'submitted' ? (
      <p className="card mt-8 p-6">This form has already been filled in – thank you. If something has changed, please contact ASPARC.</p>
    ) : (
      <p className="card mt-8 p-6">This link has expired or has been replaced by a newer one. Please contact ASPARC and we&apos;ll send you a new link.</p>
    );
  }

  const err = (k: string) => errors[k];
  const marker = (k: string) => (errors[k] ? { 'data-error': 'true' } : {});

  return (
    <form onSubmit={submit} noValidate className="mt-6 space-y-6">
      <p className="text-lg leading-relaxed text-muted">
        {loaded.recheck ? 'It has been a year since your last form, so please check your details and answer the health questions again.' : 'This helps us look after you safely.'}
        {loaded.next_visit && <> Your next appointment is <strong className="text-charcoal">{loaded.next_visit}</strong>.</>} It takes about five minutes.
      </p>
      <p className="text-sm text-muted">
        Your health answers are only seen by the ASPARC team members involved in your care. They are never used for marketing. Read our <Link href="/privacy-policy" className="text-royal underline">Privacy Policy</Link>.
      </p>

      <div className="hidden" aria-hidden="true">
        <label>
          Website <input tabIndex={-1} autoComplete="off" value={v.website} onChange={(e) => set({ website: e.target.value })} />
        </label>
      </div>

      <Card n={1} title="Your details">
        <div {...marker('for_whom')}>
          <p className="field-label">
            Who is this form for? <span className="text-danger" aria-hidden="true">*</span>
          </p>
          <div className="flex flex-wrap gap-4">
            {(
              [
                ['self', 'Me'],
                ['child', 'My child (under 18)'],
              ] as const
            ).map(([val, text]) => (
              <label key={val} className="flex items-center gap-2">
                <input type="radio" name="for_whom" className="accent-royal" checked={v.for_whom === val} onChange={() => set({ for_whom: val })} /> {text}
              </label>
            ))}
          </div>
          {err('for_whom') && <p className="mt-1 text-xs font-medium text-danger">{err('for_whom')}</p>}
        </div>
        {child && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div {...marker('athlete_name')}>
              <Field id="athlete_name" label="Child’s full name" required error={err('athlete_name')}>
                <input id="athlete_name" className="field" value={v.athlete_name} onChange={(e) => set({ athlete_name: e.target.value })} />
              </Field>
            </div>
            <div {...marker('athlete_dob')}>
              <Field id="athlete_dob" label="Child’s date of birth" required error={err('athlete_dob')}>
                <input id="athlete_dob" type="date" className="field" value={v.athlete_dob} onChange={(e) => set({ athlete_dob: e.target.value })} />
              </Field>
            </div>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div {...marker('full_name')}>
            <Field id="full_name" label={child ? 'Your full name (parent or guardian)' : 'Full name'} required error={err('full_name')}>
              <input id="full_name" className="field" autoComplete="name" value={v.full_name} onChange={(e) => set({ full_name: e.target.value })} />
            </Field>
          </div>
          {!child && (
            <div {...marker('date_of_birth')}>
              <Field id="date_of_birth" label="Date of birth" required error={err('date_of_birth')}>
                <input id="date_of_birth" type="date" className="field" autoComplete="bday" value={v.date_of_birth} onChange={(e) => set({ date_of_birth: e.target.value })} />
              </Field>
            </div>
          )}
          <div {...marker('phone')}>
            <Field id="phone" label="Mobile" required error={err('phone')}>
              <input id="phone" type="tel" className="field" autoComplete="tel" value={v.phone} onChange={(e) => set({ phone: e.target.value })} />
            </Field>
          </div>
          <div {...marker('email')}>
            <Field id="email" label="Email" error={err('email')}>
              <input id="email" type="email" className="field" autoComplete="email" value={v.email} onChange={(e) => set({ email: e.target.value })} />
            </Field>
          </div>
        </div>
        <Field id="address" label="Suburb or address" error={err('address')}>
          <input id="address" className="field" autoComplete="street-address" value={v.address} onChange={(e) => set({ address: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <div {...marker('emergency_contact_name')}>
            <Field id="ec_name" label="Emergency contact name" required error={err('emergency_contact_name')}>
              <input id="ec_name" className="field" value={v.emergency_contact_name} onChange={(e) => set({ emergency_contact_name: e.target.value })} />
            </Field>
          </div>
          <div {...marker('emergency_contact_phone')}>
            <Field id="ec_phone" label="Emergency contact phone" required error={err('emergency_contact_phone')}>
              <input id="ec_phone" type="tel" className="field" value={v.emergency_contact_phone} onChange={(e) => set({ emergency_contact_phone: e.target.value })} />
            </Field>
          </div>
        </div>
      </Card>

      <Card n={2} title="Sport and goals">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="sport" label="Main sport" error={err('sport')}>
            <input id="sport" className="field" value={v.sport} onChange={(e) => set({ sport: e.target.value })} />
          </Field>
          <Field id="club" label="Club, team or school" error={err('club')}>
            <input id="club" className="field" value={v.club} onChange={(e) => set({ club: e.target.value })} />
          </Field>
        </div>
        <Field id="goals" label="What would you like help with?" error={err('goals')}>
          <textarea id="goals" rows={3} className="field" maxLength={1000} value={v.goals} onChange={(e) => set({ goals: e.target.value })} />
        </Field>
      </Card>

      <Card n={3} title="Health check" intro={<>Please answer every question{child ? ' for your child' : ''}. A “yes” doesn&apos;t stop you training – it means we&apos;ll talk it through with you first, and we may ask you to check with your doctor.</>}>
        <ul className="divide-y divide-line rounded-md border border-line">
          {SCREENING_QUESTIONS.map((q, i) => {
            const answer = v.screening[q.key];
            const bad = err(`screening.${q.key}`);
            return (
              <li key={q.key} className={`flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between ${bad ? 'bg-[#fdecea]' : ''}`} {...marker(`screening.${q.key}`)}>
                <span className="text-[15px]">
                  <span className="mr-1.5 font-display text-sky">{i + 1}.</span>
                  {q.text}
                  {bad && <span className="block text-xs font-medium text-danger">{bad}</span>}
                </span>
                <span className="flex shrink-0 gap-2" role="radiogroup" aria-label={q.text}>
                  {([true, false] as const).map((yes) => (
                    <label key={String(yes)} className={`cursor-pointer rounded-md border px-4 py-1.5 text-sm font-medium ${answer === yes ? (yes ? 'border-warn bg-[#fff4e0] text-warn' : 'border-royal bg-royal text-white') : 'border-line bg-white'}`}>
                      <input type="radio" className="sr-only" name={q.key} checked={answer === yes} onChange={() => set({ screening: { ...v.screening, [q.key]: yes } })} />
                      {yes ? 'Yes' : 'No'}
                    </label>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
        {anyYes && (
          <Field id="screening_details" label="Tell us a bit more about any “yes” answers" error={err('screening_details')}>
            <textarea id="screening_details" rows={3} className="field" maxLength={2000} value={v.screening_details} onChange={(e) => set({ screening_details: e.target.value })} />
          </Field>
        )}
        <Field id="injuries" label="Current or past injuries, pain or surgery" hint="What, when, and how it is now." error={err('injuries')}>
          <textarea id="injuries" rows={3} className="field" maxLength={2000} value={v.injuries} onChange={(e) => set({ injuries: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="medications" label="Medications" error={err('medications')}>
            <textarea id="medications" rows={2} className="field" maxLength={2000} value={v.medications} onChange={(e) => set({ medications: e.target.value })} />
          </Field>
          <Field id="allergies" label="Allergies" hint="Including to massage oils or creams." error={err('allergies')}>
            <textarea id="allergies" rows={2} className="field" maxLength={1000} value={v.allergies} onChange={(e) => set({ allergies: e.target.value })} />
          </Field>
        </div>
        <Field id="other_health" label="Anything else we should know about your health?" error={err('other_health')}>
          <textarea id="other_health" rows={2} className="field" maxLength={2000} value={v.other_health} onChange={(e) => set({ other_health: e.target.value })} />
        </Field>
      </Card>

      <Card n={4} title="Staying in touch">
        <Field id="heard_about" label="How did you hear about ASPARC?" error={err('heard_about')}>
          <select id="heard_about" className="field" value={v.heard_about} onChange={(e) => set({ heard_about: e.target.value })}>
            <option value="">Choose one (optional)</option>
            {HEARD_ABOUT.map(([k, t]) => (
              <option key={k} value={k}>{t}</option>
            ))}
          </select>
        </Field>
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 accent-royal" checked={v.consent_marketing} onChange={(e) => set({ consent_marketing: e.target.checked })} />
          <span className="text-[15px]">{CONSENT_MARKETING_TEXT} <span className="text-muted">(optional)</span></span>
        </label>
      </Card>

      <Card n={5} title="Agreement and signature">
        <label className="flex items-start gap-3" {...marker('consent_health')}>
          <input type="checkbox" className="mt-1 accent-royal" checked={v.consent_health} onChange={(e) => set({ consent_health: e.target.checked })} />
          <span className="text-[15px]">
            {CONSENT_HEALTH_TEXT} <span className="text-danger" aria-hidden="true">*</span>
            {err('consent_health') && <span className="block text-xs font-medium text-danger">{err('consent_health')}</span>}
          </span>
        </label>
        <label className="flex items-start gap-3" {...marker('consent_risk')}>
          <input type="checkbox" className="mt-1 accent-royal" checked={v.consent_risk} onChange={(e) => set({ consent_risk: e.target.checked })} />
          <span className="text-[15px]">
            {CONSENT_RISK_TEXT} <span className="text-danger" aria-hidden="true">*</span>
            {err('consent_risk') && <span className="block text-xs font-medium text-danger">{err('consent_risk')}</span>}
          </span>
        </label>
        <div {...marker('signature_name')}>
          <Field id="signature_name" label={child ? 'Type your full name to sign as parent or guardian' : 'Type your full name to sign'} required error={err('signature_name')}>
            <input id="signature_name" className="field font-medium" value={v.signature_name} onChange={(e) => set({ signature_name: e.target.value })} />
          </Field>
        </div>
      </Card>

      {topError && (
        <p role="alert" className="rounded-md border border-danger/30 bg-[#fdecea] px-4 py-3 text-sm text-danger">
          {topError}
        </p>
      )}
      <button type="submit" className="btn-primary" disabled={sending}>
        {sending ? 'Sending…' : 'Send my form'}
      </button>
    </form>
  );
}
