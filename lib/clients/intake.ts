import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env';
import { db } from '../db';
import type { Customer, IntakeForm } from '../db/types';
import { HttpError } from '../http/respond';
import { emailLayout, escapeHtml as esc, sendEmail } from '../integrations/resend';
import { notify } from '../notifications/service';
import { melbourneDate } from '../time/melbourne';
import { HEARD_ABOUT, SCREENING_QUESTIONS, type FormFlag } from './screening';

/**
 * The pre-visit form: sent by email with a personal signed link, filled in once,
 * then kept on the client's record.
 *
 * HEALTH INFORMATION. It is never put in an email, never synced to HubSpot and
 * never given to the AI receptionist. Emails only ever carry the link.
 */

const LINK_DAYS = 30;
const VALID_MONTHS = 12;

// ------------------------------------------------------------------ signed links
const hmac = (s: string) => createHmac('sha256', `intake-form:${env.sessionSecret}`).update(s).digest('base64url');

export function intakeToken(formId: string, expiresAt: string): string {
  const body = Buffer.from(`${formId}|${Math.floor(Date.parse(expiresAt) / 1000)}`).toString('base64url');
  return `${body}.${hmac(body)}`;
}

export function readIntakeToken(token: string, now = Date.now()): string | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const want = Buffer.from(hmac(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const [id, exp] = Buffer.from(body, 'base64url').toString('utf8').split('|');
  if (!id || !/^[0-9a-f-]{36}$/i.test(id) || !(Number(exp) > now / 1000)) return null;
  return id;
}

export const intakeUrl = (form: Pick<IntakeForm, 'id' | 'expires_at'>) => `${env.siteUrl}/pre-visit/${intakeToken(form.id, form.expires_at)}`;

// ------------------------------------------------------------------ status flag (safe for every staff member)
const addMonths = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, d));
  return t.toISOString().slice(0, 10);
};

/** One label for a client's forms. Contains no health detail. */
export function formFlag(forms: Pick<IntakeForm, 'status' | 'submitted_at' | 'review_status' | 'valid_until' | 'expires_at' | 'sent_at'>[], today = melbourneDate()): FormFlag {
  const live = forms.filter((f) => f.status !== 'cancelled');
  const submitted = live.filter((f) => f.status === 'submitted').sort((a, b) => (b.submitted_at ?? '').localeCompare(a.submitted_at ?? ''))[0];
  const pending = live.some((f) => f.status === 'sent' && Date.parse(f.expires_at) > Date.now());
  if (submitted) {
    if (submitted.review_status === 'needs_review') return 'needs_review';
    if (submitted.review_status === 'not_cleared') return 'not_cleared';
    if (!submitted.valid_until || submitted.valid_until < today) return pending ? 'sent' : 'expired';
    return submitted.review_status === 'cleared' ? 'cleared' : 'complete';
  }
  return pending ? 'sent' : 'missing';
}

// ------------------------------------------------------------------ sending
type SendResult = { form: IntakeForm; link: string; email: 'sent' | 'not_configured' | 'failed' | 'no_email' };

async function nextVisitLabel(customerId: string): Promise<string | null> {
  const appts = await db().list('appointments', { eq: { customer_id: customerId, status: 'confirmed' }, orderBy: 'starts_at', ascending: true, limit: 200 });
  const next = appts.find((a) => Date.parse(a.starts_at) > Date.now());
  return next
    ? new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(next.starts_at))
    : null;
}

/** Creates a new form (cancelling any unfinished one) and emails the link when asked. */
export async function sendIntakeForm(customer: Customer, opts: { reason: IntakeForm['reason']; sentBy: string; email: boolean }): Promise<SendResult> {
  const repo = db();
  for (const old of await repo.list('intake_forms', { eq: { customer_id: customer.id, status: 'sent' } })) {
    await repo.update('intake_forms', old.id, { status: 'cancelled' });
  }
  const now = new Date();
  const form = await repo.insert('intake_forms', {
    customer_id: customer.id,
    status: 'sent',
    sent_at: now.toISOString(),
    sent_by: opts.sentBy.slice(0, 200),
    sent_to: opts.email && customer.email ? customer.email : null,
    reason: opts.reason,
    expires_at: new Date(now.getTime() + LINK_DAYS * 86400_000).toISOString(),
  } as Partial<IntakeForm> as IntakeForm);
  const link = intakeUrl(form);
  if (!opts.email) return { form, link, email: 'no_email' };
  if (!customer.email) return { form, link, email: 'no_email' };

  const visit = await nextVisitLabel(customer.id);
  const recheck = opts.reason === 'yearly_recheck';
  const lead = recheck
    ? 'It has been a year since you filled in your ASPARC health form, so we ask everyone to check their details again.'
    : `Thanks for booking with ASPARC. Please fill in this short form${visit ? ` before your appointment on ${visit}` : ' before your first visit'}.`;
  const why = 'It asks for your contact details, an emergency contact and a few health questions so we can look after you safely. It takes about five minutes.';
  const fine = `The link is personal to you – please don't forward it. It works for ${LINK_DAYS} days.`;
  try {
    const r = await sendEmail({
      to: [customer.email],
      subject: recheck ? 'Time to update your ASPARC health form' : 'Before your visit: your ASPARC pre-visit form',
      text: `Hi ${customer.full_name},\n\n${lead}\n\n${why}\n\nFill in the form: ${link}\n\n${fine}\n\nASPARC`,
      html: emailLayout(
        recheck ? 'Please update your health form' : 'Your pre-visit form',
        `<p>Hi ${esc(customer.full_name)},</p><p>${esc(lead)}</p><p>${esc(why)}</p><p style="color:#5b6472;font-size:13px">${esc(fine)}</p>`,
        { label: 'Fill in the form', url: link },
      ),
      entityType: 'intake_form',
      entityId: form.id,
    });
    return { form, link, email: r.status === 'sent' ? 'sent' : r.status === 'not_configured' ? 'not_configured' : 'failed' };
  } catch {
    return { form, link, email: 'failed' };
  }
}

/**
 * Called after a booking is made. Sends the form when the client has never
 * filled one in, or when theirs is more than a year old on the day of the visit.
 * Never throws: a booking must not fail because of the form.
 */
export async function sendIntakeIfDue(customerId: string, visitStartsAt: string, sentBy: string): Promise<SendResult['email'] | 'not_due' | 'error'> {
  try {
    const repo = db();
    const customer = await repo.get('customers', customerId);
    if (!customer?.email) return 'no_email';
    const forms = await repo.list('intake_forms', { eq: { customer_id: customerId }, limit: 100 });
    const visitDay = melbourneDate(new Date(visitStartsAt));
    const live = forms.filter((f) => f.status !== 'cancelled');
    if (live.some((f) => f.status === 'submitted' && f.valid_until && f.valid_until >= visitDay)) return 'not_due';
    if (live.some((f) => f.status === 'sent' && Date.parse(f.expires_at) > Date.now())) return 'not_due';
    const reason = live.some((f) => f.status === 'submitted') ? 'yearly_recheck' : 'first_booking';
    return (await sendIntakeForm(customer, { reason, sentBy, email: true })).email;
  } catch (e) {
    console.error('[intake] could not send the pre-visit form', e);
    return 'error';
  }
}

// ------------------------------------------------------------------ the public form
export type PublicFormState = 'open' | 'submitted' | 'expired';

async function formForToken(token: string): Promise<{ form: IntakeForm | null; state: PublicFormState }> {
  const id = readIntakeToken(token);
  if (!id) return { form: null, state: 'expired' };
  const form = await db().get('intake_forms', id);
  if (!form || form.status === 'cancelled' || Date.parse(form.expires_at) <= Date.now()) return { form: null, state: 'expired' };
  return { form, state: form.status === 'submitted' ? 'submitted' : 'open' };
}

/** What the public page needs. Only basic contact details are pre-filled – never health answers. */
export async function publicIntake(token: string) {
  const { form, state } = await formForToken(token);
  if (!form || state !== 'open') return { state };
  const c = await db().get('customers', form.customer_id);
  if (!c) return { state: 'expired' as const };
  return {
    state,
    recheck: form.reason === 'yearly_recheck',
    next_visit: await nextVisitLabel(c.id),
    prefill: { full_name: c.full_name, email: c.email ?? '', phone: c.phone ?? '', sport: c.sport ?? '', club: c.club ?? '', consent_marketing: c.consent_marketing },
  };
}

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));
const phone = (msg: string) => z.string().trim().regex(/^[+()\d\s-]{8,20}$/, msg);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date');
const pastDate = ymd.refine((v) => v >= '1900-01-01' && v <= melbourneDate(), 'Enter a real date of birth');

const Screening = z.object(
  Object.fromEntries(SCREENING_QUESTIONS.map((q) => [q.key, z.boolean({ required_error: 'Please answer yes or no', invalid_type_error: 'Please answer yes or no' })])) as Record<
    (typeof SCREENING_QUESTIONS)[number]['key'],
    z.ZodBoolean
  >,
);

export const IntakeSubmit = z
  .object({
    for_whom: z.enum(['self', 'child'], { errorMap: () => ({ message: 'Choose who this form is for' }) }),
    full_name: z.string().trim().min(2, 'Enter your full name').max(160),
    email: z
      .string()
      .trim()
      .max(254)
      .optional()
      .transform((v) => (v ? v.toLowerCase() : null))
      .refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Enter a valid email address'),
    phone: phone('Enter a valid mobile number'),
    date_of_birth: pastDate.optional(),
    athlete_name: text(160),
    athlete_dob: pastDate.optional(),
    address: text(300),
    emergency_contact_name: z.string().trim().min(2, 'Enter an emergency contact').max(120),
    emergency_contact_phone: phone('Enter a valid phone number for your emergency contact'),
    sport: text(80),
    club: text(120),
    goals: text(1000),
    heard_about: z.enum(HEARD_ABOUT.map(([k]) => k) as [string, ...string[]]).optional(),
    screening: Screening,
    screening_details: text(2000),
    injuries: text(2000),
    medications: text(2000),
    allergies: text(1000),
    other_health: text(2000),
    consent_health: z.literal(true, { errorMap: () => ({ message: 'We need your agreement to keep this health information' }) }),
    consent_risk: z.literal(true, { errorMap: () => ({ message: 'Please confirm this statement' }) }),
    consent_marketing: z.boolean().default(false),
    signature_name: z.string().trim().min(2, 'Type your full name to sign').max(160),
    website: z.string().max(200).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.for_whom === 'self' && !v.date_of_birth) ctx.addIssue({ code: 'custom', path: ['date_of_birth'], message: 'Enter your date of birth' });
    if (v.for_whom === 'child') {
      if (!v.athlete_name || v.athlete_name.length < 2) ctx.addIssue({ code: 'custom', path: ['athlete_name'], message: 'Enter your child’s full name' });
      if (!v.athlete_dob) ctx.addIssue({ code: 'custom', path: ['athlete_dob'], message: 'Enter your child’s date of birth' });
    }
  });

/** Saves a completed form once. Any "yes" in the screening marks it for review before the session. */
export async function submitIntake(token: string, raw: unknown) {
  const { form, state } = await formForToken(token);
  if (!form) throw new HttpError(410, 'This form link has expired. Please contact ASPARC for a new one.');
  if (state === 'submitted') throw new HttpError(409, 'This form has already been sent. Thank you!');
  const v = IntakeSubmit.parse(raw);
  const repo = db();
  const customer = await repo.get('customers', form.customer_id);
  if (!customer) throw new HttpError(410, 'This form link has expired. Please contact ASPARC for a new one.');

  const flags = SCREENING_QUESTIONS.filter((q) => v.screening[q.key]).length;
  const now = new Date();
  const today = melbourneDate(now);
  const saved = await repo.update('intake_forms', form.id, {
    status: 'submitted',
    submitted_at: now.toISOString(),
    for_whom: v.for_whom,
    athlete_name: v.for_whom === 'child' ? v.athlete_name : v.full_name,
    athlete_dob: v.for_whom === 'child' ? v.athlete_dob ?? null : v.date_of_birth ?? null,
    details: {
      full_name: v.full_name,
      email: v.email,
      phone: v.phone,
      date_of_birth: v.date_of_birth ?? null,
      address: v.address,
      emergency_contact_name: v.emergency_contact_name,
      emergency_contact_phone: v.emergency_contact_phone,
      sport: v.sport,
      club: v.club,
      goals: v.goals,
      heard_about: v.heard_about ?? null,
    },
    screening: { ...v.screening, details: v.screening_details },
    health: { injuries: v.injuries, medications: v.medications, allergies: v.allergies, other: v.other_health },
    screening_flags: flags,
    review_status: flags > 0 ? 'needs_review' : 'not_needed',
    consent_health: true,
    consent_risk: true,
    consent_marketing: v.consent_marketing,
    signature_name: v.signature_name,
    valid_until: addMonths(today, VALID_MONTHS),
  });

  // Contact details go on the client record. Health answers stay on the form only.
  await repo.update('customers', customer.id, {
    phone: v.phone,
    email: customer.email ?? v.email,
    address: v.address ?? customer.address ?? null,
    emergency_contact_name: v.emergency_contact_name,
    emergency_contact_phone: v.emergency_contact_phone,
    sport: v.sport ?? customer.sport ?? null,
    club: v.club ?? customer.club ?? null,
    ...(v.for_whom === 'self' ? { date_of_birth: v.date_of_birth ?? null } : { is_guardian: true }),
    consent_marketing: v.consent_marketing,
    consent_marketing_at: v.consent_marketing ? (customer.consent_marketing ? customer.consent_marketing_at : now.toISOString()) : null,
  });

  // Tells the team without any health detail.
  const who = v.for_whom === 'child' ? `${v.athlete_name} (parent: ${customer.full_name})` : customer.full_name;
  await notify({
    type: 'booking_request',
    title: flags ? `Pre-visit form needs review – ${who}` : `Pre-visit form completed – ${who}`,
    body: flags
      ? 'One or more screening answers were “yes”. Please review the form before the session; GP clearance may be needed. Open the client record to see it.'
      : 'The pre-visit form is complete with no screening flags.',
    severity: flags ? 'important' : 'info',
    linkPath: `/admin/clients?id=${customer.id}`,
    email: flags > 0,
  }).catch((e) => console.error('[intake] notify failed', e));

  return { ok: true, needs_review: flags > 0, valid_until: saved?.valid_until ?? null };
}

// ------------------------------------------------------------------ review
export const ReviewInput = z
  .object({
    decision: z.enum(['cleared', 'not_cleared', 'needs_review']),
    note: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .transform((v) => (v ? v : null)),
  })
  .strict();

export async function reviewIntake(id: string, raw: unknown, reviewer: string) {
  const input = ReviewInput.parse(raw);
  const form = await db().get('intake_forms', id);
  if (!form) throw new HttpError(404, 'Form not found');
  if (form.status !== 'submitted') throw new HttpError(422, 'Only a completed form can be reviewed.');
  return db().update('intake_forms', id, {
    review_status: input.decision,
    review_note: input.note,
    reviewed_by: reviewer.slice(0, 200),
    reviewed_at: new Date().toISOString(),
  });
}

export { addMonths };
