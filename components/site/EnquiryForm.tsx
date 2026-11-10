'use client';

import Link from 'next/link';
import { useId, useState, type FormEvent, type ReactNode } from 'react';

export type FormKind = 'contact' | 'academy' | 'booking' | 'club' | 'massage';

export interface ServiceOption {
  name: string;
  category: string;
}

interface Props {
  form: FormKind;
  services?: ServiceOption[];
  leadType?: string;
  serviceInterest?: string;
  ageGroup?: string;
  conversationId?: string;
  compact?: boolean;
  onSubmitted?: (reference: string) => void;
  dark?: boolean;
}

const AGE_GROUPS = [
  ['8-10', '8–10 years'],
  ['11-13', '11–13 years'],
  ['14-16', '14–16 years'],
  ['16-18', '16–18 years'],
] as const;

const TITLES: Record<FormKind, string> = {
  contact: 'Send an enquiry',
  academy: 'Register your interest – Performance Academy',
  booking: 'Request a booking',
  club: 'Club partnership enquiry',
  massage: 'Remedial massage enquiry',
};

/** Defined at module scope so inputs keep their values across re-renders. */
function FieldRow({ label, required, children, hint, htmlFor, errorId, error }: { name: string; label: string; required?: boolean; children: ReactNode; hint?: string; htmlFor: string; errorId: string; error?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="field-label">
        {label} {required && <span className="text-danger" aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && (
        <p id={errorId} className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function EnquiryForm({ form, services = [], leadType, serviceInterest, ageGroup, conversationId, compact = false, onSubmitted }: Props) {
  const uid = useId();
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const id = (n: string) => `${uid}-${n}`;

  const bookable = services.filter((s) => (form === 'massage' ? s.category === 'recovery' : s.category !== 'testing' || form === 'contact'));

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const v = (k: string) => {
      const x = fd.get(k);
      return typeof x === 'string' && x.trim() ? x.trim() : undefined;
    };
    const payload: Record<string, unknown> = {
      form,
      lead_type: leadType,
      full_name: v('full_name'),
      email: v('email'),
      phone: v('phone'),
      preferred_contact: v('preferred_contact'),
      consent_contact: fd.get('consent_contact') === 'on',
      consent_marketing: fd.get('consent_marketing') === 'on',
      is_guardian: fd.get('is_guardian') === 'on',
      service_interest: v('service_interest') ?? serviceInterest,
      details: v('details'),
      athlete_first_name: v('athlete_first_name'),
      athlete_last_name: v('athlete_last_name'),
      athlete_age_group: v('athlete_age_group'),
      club_or_school: v('club_or_school'),
      preferred_days: v('preferred_days'),
      preferred_times: v('preferred_times'),
      club_name: v('club_name'),
      club_role: v('club_role'),
      athlete_count: v('athlete_count'),
      conversation_id: conversationId,
      website: (fd.get('website') as string) || undefined,
    };
    for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k];

    setState('sending');
    setErrors({});
    try {
      const res = await fetch('/api/enquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string; fields?: Record<string, string>; reference?: string };
      if (!res.ok) {
        setErrors(body.fields ?? {});
        setMessage(body.error ?? 'Something went wrong. Please try again.');
        setState('error');
        return;
      }
      setMessage(body.message ?? 'Thanks – we have received your enquiry.');
      setState('done');
      onSubmitted?.(body.reference ?? '');
    } catch {
      setMessage('We could not send your enquiry. Please check your connection and try again.');
      setState('error');
    }
  }

  if (state === 'done') {
    return (
      <div role="status" className={`rounded-lg border border-success/30 bg-[#effaf4] ${compact ? 'p-4' : 'p-8'}`}>
        <p className="font-display text-xl font-bold uppercase text-success">Enquiry received</p>
        <p className="mt-2 text-[15px] text-charcoal/80">{message}</p>
      </div>
    );
  }

  const gap = compact ? 'gap-3' : 'gap-5';
  const input = (name: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input id={id(name)} name={name} className="field" aria-invalid={!!errors[name]} aria-describedby={errors[name] ? id(`${name}-err`) : undefined} {...props} />
  );

  return (
    <form onSubmit={onSubmit} noValidate className={`grid ${gap}`} aria-label={TITLES[form]}>
      {!compact && <h3 className="text-2xl uppercase">{TITLES[form]}</h3>}

      {form === 'academy' && (
        <div className={`rounded-md border border-sky/40 bg-sky-100/60 ${compact ? 'p-3 text-xs' : 'p-4 text-sm'} text-royal-800`}>
          Academy registrations are completed by a <strong>parent or guardian</strong>. This registers your interest – a place is only confirmed once the ASPARC team contacts you.
        </div>
      )}
      {(form === 'booking' || form === 'massage') && (
        <div className={`rounded-md border border-sky/40 bg-sky-100/60 ${compact ? 'p-3 text-xs' : 'p-4 text-sm'} text-royal-800`}>
          This is a <strong>booking request</strong>, not a confirmed appointment. The team will contact you to arrange a time.
        </div>
      )}

      <div className={`grid ${gap} sm:grid-cols-2`}>
        <FieldRow name="full_name" htmlFor={id('full_name')} errorId={id('full_name-err')} error={errors.full_name} label={form === 'academy' ? 'Parent/guardian full name' : 'Full name'} required>
          {input('full_name', { autoComplete: 'name', required: true, maxLength: 160 })}
        </FieldRow>
        <FieldRow name="email" htmlFor={id('email')} errorId={id('email-err')} error={errors.email} label="Email" required>
          {input('email', { type: 'email', autoComplete: 'email', maxLength: 254 })}
        </FieldRow>
        <FieldRow name="phone" htmlFor={id('phone')} errorId={id('phone-err')} error={errors.phone} label="Phone" hint="Email or phone is required">
          {input('phone', { type: 'tel', autoComplete: 'tel', maxLength: 32 })}
        </FieldRow>
        <FieldRow name="preferred_contact" htmlFor={id('preferred_contact')} errorId={id('preferred_contact-err')} error={errors.preferred_contact} label="Preferred contact method">
          <select id={id('preferred_contact')} name="preferred_contact" className="field" defaultValue="email">
            <option value="email">Email</option>
            <option value="phone">Phone call</option>
            <option value="sms">SMS</option>
          </select>
        </FieldRow>
      </div>

      {form === 'academy' && (
        <div className={`grid ${gap} sm:grid-cols-2`}>
          <FieldRow name="athlete_first_name" htmlFor={id('athlete_first_name')} errorId={id('athlete_first_name-err')} error={errors.athlete_first_name} label="Athlete first name" required>
            {input('athlete_first_name', { maxLength: 80, autoComplete: 'off' })}
          </FieldRow>
          <FieldRow name="athlete_last_name" htmlFor={id('athlete_last_name')} errorId={id('athlete_last_name-err')} error={errors.athlete_last_name} label="Athlete last name">
            {input('athlete_last_name', { maxLength: 80, autoComplete: 'off' })}
          </FieldRow>
          <FieldRow name="athlete_age_group" htmlFor={id('athlete_age_group')} errorId={id('athlete_age_group-err')} error={errors.athlete_age_group} label="Age group" required>
            <select id={id('athlete_age_group')} name="athlete_age_group" className="field" defaultValue={ageGroup ?? ''}>
              <option value="" disabled>Select…</option>
              {AGE_GROUPS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </FieldRow>
          <FieldRow name="club_or_school" htmlFor={id('club_or_school')} errorId={id('club_or_school-err')} error={errors.club_or_school} label="Club or school (optional)">
            {input('club_or_school', { maxLength: 120 })}
          </FieldRow>
        </div>
      )}

      {(form === 'booking' || form === 'massage' || (form === 'contact' && !serviceInterest)) && bookable.length > 0 && (
        <FieldRow name="service_interest" htmlFor={id('service_interest')} errorId={id('service_interest-err')} error={errors.service_interest} label={form === 'contact' ? 'Service of interest' : 'Service'} required={form !== 'contact'}>
          <select id={id('service_interest')} name="service_interest" className="field" defaultValue={serviceInterest ?? ''}>
            <option value="">{form === 'contact' ? 'General enquiry' : 'Select a service…'}</option>
            {bookable.map((s) => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
          </select>
        </FieldRow>
      )}

      {(form === 'booking' || form === 'massage') && (
        <div className={`grid ${gap} sm:grid-cols-2`}>
          <FieldRow name="preferred_days" htmlFor={id('preferred_days')} errorId={id('preferred_days-err')} error={errors.preferred_days} label="Preferred days">
            {input('preferred_days', { placeholder: 'e.g. Tue or Thu', maxLength: 200 })}
          </FieldRow>
          <FieldRow name="preferred_times" htmlFor={id('preferred_times')} errorId={id('preferred_times-err')} error={errors.preferred_times} label="Preferred times">
            {input('preferred_times', { placeholder: 'e.g. after 4pm', maxLength: 200 })}
          </FieldRow>
        </div>
      )}

      {form === 'club' && (
        <div className={`grid ${gap} sm:grid-cols-3`}>
          <FieldRow name="club_name" htmlFor={id('club_name')} errorId={id('club_name-err')} error={errors.club_name} label="Club name" required>
            {input('club_name', { maxLength: 160 })}
          </FieldRow>
          <FieldRow name="club_role" htmlFor={id('club_role')} errorId={id('club_role-err')} error={errors.club_role} label="Your role">
            {input('club_role', { maxLength: 120, placeholder: 'e.g. Technical Director' })}
          </FieldRow>
          <FieldRow name="athlete_count" htmlFor={id('athlete_count')} errorId={id('athlete_count-err')} error={errors.athlete_count} label="Approx. athletes">
            {input('athlete_count', { maxLength: 40 })}
          </FieldRow>
        </div>
      )}

      <FieldRow name="details" htmlFor={id('details')} errorId={id('details-err')} error={errors.details} label={form === 'academy' ? 'Questions about the program' : 'How can we help?'} hint="Please don’t include medical or injury details here – we’ll discuss anything relevant with you directly.">
        <textarea id={id('details')} name="details" rows={compact ? 2 : 4} maxLength={2000} className="field resize-y" />
      </FieldRow>

      {/* Honeypot – hidden from people, catches bots */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <fieldset className="grid gap-2.5 text-sm">
        <legend className="sr-only">Consent</legend>
        {form === 'academy' && (
          <label className="flex items-start gap-2.5">
            <input type="checkbox" name="is_guardian" className="mt-0.5 h-4 w-4 accent-royal" />
            <span>
              I am the parent or legal guardian of this athlete and consent to ASPARC using these details to respond to this registration. <span className="text-danger">*</span>
              {errors.is_guardian && <span className="block text-xs font-medium text-danger">{errors.is_guardian}</span>}
            </span>
          </label>
        )}
        <label className="flex items-start gap-2.5">
          <input type="checkbox" name="consent_contact" className="mt-0.5 h-4 w-4 accent-royal" />
          <span>
            I agree to ASPARC contacting me about this enquiry, as described in the{' '}
            <Link href="/privacy-policy" className="text-royal underline" target={compact ? '_blank' : undefined}>
              Privacy Policy
            </Link>
            . <span className="text-danger">*</span>
            {errors.consent_contact && <span className="block text-xs font-medium text-danger">{errors.consent_contact}</span>}
          </span>
        </label>
        <label className="flex items-start gap-2.5 text-muted">
          <input type="checkbox" name="consent_marketing" className="mt-0.5 h-4 w-4 accent-royal" />
          <span>Optional: send me ASPARC news and program updates. You can unsubscribe at any time.</span>
        </label>
      </fieldset>

      {state === 'error' && (
        <p role="alert" className="rounded-md bg-[#fdecea] px-3 py-2 text-sm font-medium text-danger">
          {message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className="btn-primary" disabled={state === 'sending'}>
          {state === 'sending' ? 'Sending…' : form === 'academy' ? 'Register interest' : form === 'booking' || form === 'massage' ? 'Send request' : 'Send enquiry'}
        </button>
        {!compact && <p className="text-xs text-muted">No payment is taken through this form.</p>}
      </div>
    </form>
  );
}
