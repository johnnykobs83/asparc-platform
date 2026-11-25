import { z } from 'zod';
import { db } from '../db';
import type { AcademyEnrolment, AcademySession, Customer, Service } from '../db/types';
import { HttpError } from '../http/respond';
import { emailLayout, escapeHtml as esc, sendEmail } from '../integrations/resend';
import { notify } from '../notifications/service';
import { addDays, melbourneDate } from '../time/melbourne';
import { sendIntakeIfDue } from '../clients/intake';
import { listServices } from '../kb/service';
import { GST_REGISTERED } from '../brand';
import { ACADEMY, ACADEMY_PACKAGES, DEFAULT_TIMETABLE, ageOn, groupOf, packageOf, slotText, type AcademyPackageKey } from './config';

/**
 * ASPARC Football Performance Academy: the weekly timetable, places left in each
 * session, and parents' enrolments. Places are held by enrolments that are
 * awaiting payment or confirmed; waitlisted and cancelled ones don't count.
 */

const HOLDS = new Set<AcademyEnrolment['status']>(['awaiting_payment', 'confirmed']);

/** Makes sure the timetable exists (the migration seeds it in production; tests start empty). */
export async function timetable(): Promise<AcademySession[]> {
  const repo = db();
  let rows = await repo.list('academy_sessions', { limit: 500 });
  if (!rows.length) {
    for (const t of DEFAULT_TIMETABLE) await repo.insert('academy_sessions', { group_key: t.group, weekday: t.weekday, start_minutes: t.start, end_minutes: t.end } as Partial<AcademySession> as AcademySession);
    rows = await repo.list('academy_sessions', { limit: 500 });
  }
  return rows.sort((a, b) => a.weekday - b.weekday || a.start_minutes - b.start_minutes);
}

/** How many weekly places each session has taken (term and annual enrolments). Casual places are per date. */
function takenBySession(enrolments: AcademyEnrolment[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of enrolments) {
    if (!HOLDS.has(e.status) || e.package === 'casual') continue;
    for (const id of e.session_ids ?? []) m.set(id, (m.get(id) ?? 0) + 1);
  }
  return m;
}
const casualOn = (enrolments: AcademyEnrolment[], sessionId: string, date: string) =>
  enrolments.filter((e) => HOLDS.has(e.status) && e.package === 'casual' && e.casual_date === date && e.session_ids.includes(sessionId)).length;

async function packageServices(): Promise<Map<AcademyPackageKey, Service | null>> {
  const services = (await listServices()).filter((s) => s.category === 'academy');
  return new Map(ACADEMY_PACKAGES.map((p) => [p.key, services.find((s) => s.slug === p.slug && s.is_public) ?? null]));
}
const priceOf = (s: Service | null) => (s && s.price_status !== 'on_enquiry' ? s.price_cents : null);

/** What the website needs: groups, the timetable with places left, and the packages with live prices. */
export async function publicAcademy() {
  const [sessions, enrolments, services] = await Promise.all([timetable(), db().list('academy_enrolments', { limit: 5000 }), packageServices()]);
  const taken = takenBySession(enrolments);
  return {
    term: ACADEMY.term,
    venue: ACADEMY.venue,
    sessions: sessions
      .filter((s) => s.active)
      .map((s) => {
        const left = Math.max(0, s.capacity - (taken.get(s.id) ?? 0));
        return { id: s.id, group_key: s.group_key, weekday: s.weekday, start_minutes: s.start_minutes, end_minutes: s.end_minutes, places_left: left, full: left === 0 };
      }),
    packages: ACADEMY_PACKAGES.map((p) => {
      const s = services.get(p.key) ?? null;
      return {
        key: p.key,
        label: p.label,
        detail: p.detail,
        sessions: p.sessions,
        price_cents: priceOf(s),
        standard_price_cents: s?.standard_price_cents ?? null,
        price_status: s?.price_status ?? null,
        offer_label: s?.offer_label ?? null,
        available: Boolean(s && s.availability !== 'unavailable'),
      };
    }),
  };
}

// ------------------------------------------------------------------ enrol
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date');
export const EnrolInput = z
  .object({
    parent_name: z.string().trim().min(2, 'Enter your full name').max(160),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254)
      .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'Enter a valid email address'),
    phone: z.string().trim().regex(/^[+()\d\s-]{8,20}$/, 'Enter a valid mobile number'),
    athlete_name: z.string().trim().min(2, 'Enter your child’s full name').max(160),
    athlete_dob: ymd.refine((v) => v >= '2000-01-01' && v <= melbourneDate(), 'Enter your child’s date of birth'),
    group_key: z.enum(['foundation', 'athletic', 'performance'], { errorMap: () => ({ message: 'Choose a group' }) }),
    package: z.enum(['term_1x', 'term_2x', 'annual', 'casual'], { errorMap: () => ({ message: 'Choose a package' }) }),
    session_ids: z.array(z.string().uuid()).min(1, 'Choose a session').max(2),
    casual_date: ymd.optional(),
    club: z
      .string()
      .trim()
      .max(120)
      .optional()
      .transform((v) => v || null),
    note: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .transform((v) => v || null),
    guardian_consent: z.literal(true, { errorMap: () => ({ message: 'A parent or guardian must agree to enrol' }) }),
    consent_marketing: z.boolean().default(false),
    website: z.string().max(200).optional(),
  })
  .strict();

const WEEKDAY_OF = (d: string) => ((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

export async function enrol(raw: unknown) {
  const v = EnrolInput.parse(raw);
  const repo = db();
  const group = groupOf(v.group_key)!;
  const pkg = packageOf(v.package)!;
  const fields: Record<string, string> = {};

  // Age: fits the group today, or by the start of the year (kids enrol ahead of Term 1).
  const today = melbourneDate();
  const ages = [ageOn(v.athlete_dob, today), ageOn(v.athlete_dob, addDays(today, 90))].filter((a): a is number => a != null);
  if (!ages.some((a) => a >= group.minAge && a <= group.maxAge)) fields.group_key = `${group.name} is for ${group.ages} year olds. Choose the group for your child’s age.`;

  const sessions = await timetable();
  const chosen = [...new Set(v.session_ids)].map((id) => sessions.find((s) => s.id === id && s.active));
  if (chosen.some((s) => !s)) fields.session_ids = 'One of those sessions is no longer running. Please choose again.';
  else if (chosen.some((s) => s!.group_key !== v.group_key)) fields.session_ids = `Choose ${group.name} sessions.`;
  else if (chosen.length !== pkg.sessions) fields.session_ids = pkg.sessions === 2 ? 'Choose two sessions a week.' : 'Choose one session.';
  else if (pkg.sessions === 2 && chosen[0]!.weekday === chosen[1]!.weekday) fields.session_ids = 'Choose sessions on two different days.';

  if (v.package === 'casual') {
    if (!v.casual_date) fields.casual_date = 'Choose the date of the session.';
    else if (v.casual_date < today || v.casual_date > addDays(today, 180)) fields.casual_date = 'Choose a date in the next six months.';
    else if (chosen[0] && WEEKDAY_OF(v.casual_date) !== chosen[0].weekday) fields.casual_date = `That date isn’t a ${['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][chosen[0].weekday]}.`;
  }
  if (Object.keys(fields).length) throw new HttpError(422, 'Please check the highlighted fields.', fields);

  const services = await packageServices();
  const service = services.get(v.package) ?? null;
  if (!service || service.availability === 'unavailable') throw new HttpError(422, 'That package isn’t available right now. Please choose another.', { package: 'Not available right now' });

  // Places: a full session puts the enrolment on the waitlist instead of refusing it.
  const enrolments = await repo.list('academy_enrolments', { limit: 5000 });
  const taken = takenBySession(enrolments);
  const full = chosen.filter((s) => {
    const used = (taken.get(s!.id) ?? 0) + (v.package === 'casual' && v.casual_date ? casualOn(enrolments, s!.id, v.casual_date) : 0);
    return used >= s!.capacity;
  });
  const status: AcademyEnrolment['status'] = full.length ? 'waitlist' : 'awaiting_payment';

  const customer = await upsertParent(v);
  const enrolment = await repo.insert('academy_enrolments', {
    customer_id: customer.id,
    athlete_name: v.athlete_name,
    athlete_dob: v.athlete_dob,
    group_key: v.group_key,
    package: v.package,
    session_ids: chosen.map((s) => s!.id),
    casual_date: v.package === 'casual' ? v.casual_date! : null,
    term_label: ACADEMY.term,
    status,
    price_cents: priceOf(service),
    club: v.club,
    parent_note: v.note,
    guardian_consent: true,
    consent_marketing: v.consent_marketing,
    source: 'website',
  } as Partial<AcademyEnrolment> as AcademyEnrolment);

  const when = chosen.map((s) => slotText(s!)).join(' and ');
  const what = `${group.name} (${group.ages}) – ${pkg.label}${pkg.key === 'casual' ? ` on ${v.casual_date}` : `, ${pkg.detail}`}`;
  const price = priceOf(service);
  const dollars = price != null ? `$${price % 100 ? (price / 100).toFixed(2) : price / 100}` : null;
  await notify({
    type: 'academy_enquiry',
    title: `${status === 'waitlist' ? 'Academy waitlist' : 'New Academy enrolment'}: ${v.athlete_name} – ${group.name}`,
    body: `${v.parent_name} enrolled ${v.athlete_name} in ${what}: ${when}.${dollars ? ` ${dollars}.` : ''} ${status === 'waitlist' ? `Waitlisted – ${full.map((s) => slotText(s!)).join(', ')} is full.` : 'Awaiting payment.'}\n${v.email} · ${v.phone}`,
    severity: 'important',
    linkPath: '/admin/academy',
  }).catch((e) => console.error('[academy] notify failed', e));

  const payUrl = service.payment_link_url && status !== 'waitlist' ? payLink(service.payment_link_url, enrolment.id, v.email) : null;
  const email = await emailParent(v.parent_name, v.email, { athlete: v.athlete_name, what, when, price: dollars, status, payUrl, start: v.package === 'casual' ? null : ACADEMY.term }).catch(() => 'failed' as const);
  // The pre-visit health form – the parent fills it in for their child.
  const form = await sendIntakeIfDue(customer.id, new Date().toISOString(), 'academy enrolment');

  return { id: enrolment.id, reference: enrolment.id.slice(0, 8).toUpperCase(), status, pay_url: payUrl, price_cents: price, email, pre_visit_form: form };
}

/** Stripe Payment Links accept a reference and the customer's email in the URL. */
const payLink = (base: string, ref: string, email: string) => {
  const u = new URL(base);
  u.searchParams.set('client_reference_id', ref);
  u.searchParams.set('prefilled_email', email);
  return u.toString();
};

async function upsertParent(v: z.output<typeof EnrolInput>): Promise<Customer> {
  const repo = db();
  const now = new Date().toISOString();
  const existing = await repo.findOne('customers', { email: v.email });
  const marketing = v.consent_marketing ? { consent_marketing: true, consent_marketing_at: now } : {};
  if (existing) return (await repo.update('customers', existing.id, { phone: existing.phone ?? v.phone, is_guardian: true, ...(existing.consent_marketing ? {} : marketing) }))!;
  return repo.insert('customers', {
    full_name: v.parent_name,
    email: v.email,
    phone: v.phone,
    preferred_contact: 'email',
    is_guardian: true,
    consent_contact: true,
    consent_contact_at: now,
    consent_marketing: v.consent_marketing,
    consent_marketing_at: v.consent_marketing ? now : null,
    source: 'academy_form',
    club: v.club,
  } as Partial<Customer> as Customer);
}

async function emailParent(
  name: string,
  to: string,
  d: { athlete: string; what: string; when: string; price: string | null; status: AcademyEnrolment['status']; payUrl: string | null; start: string | null },
): Promise<'sent' | 'not_configured' | 'failed'> {
  const waitlist = d.status === 'waitlist';
  const lead = waitlist
    ? `Thanks for enrolling ${d.athlete} in the ${ACADEMY.name}. The session you chose is full right now, so ${d.athlete} is on the waitlist. We’ll contact you as soon as a place opens up or to offer another session – nothing is payable yet.`
    : `Thanks for enrolling ${d.athlete} in the ${ACADEMY.name}. Their place is held for you.`;
  const lines = [d.what, d.when, d.start ? `Starts ${d.start} at ${ACADEMY.venue}` : `At ${ACADEMY.venue}`, d.price && !waitlist ? `Price: ${d.price}${GST_REGISTERED ? ' (incl. GST)' : ''}` : ''].filter(Boolean);
  const pay = waitlist ? '' : d.payUrl ? 'Please complete payment to confirm the place.' : 'We’ll send you the payment details shortly to confirm the place.';
  const r = await sendEmail({
    to: [to],
    subject: waitlist ? `${d.athlete} is on the ASPARC Academy waitlist` : `${d.athlete}’s place in the ASPARC Football Performance Academy`,
    text: `Hi ${name},\n\n${lead}\n\n${lines.join('\n')}\n\n${pay}${d.payUrl ? `\n${d.payUrl}` : ''}\n\nWe’ll also send a short pre-visit health form to fill in for ${d.athlete} before their first session.\n\nASPARC`,
    html: emailLayout(
      waitlist ? 'You’re on the waitlist' : 'Enrolment received',
      `<p>Hi ${esc(name)},</p><p>${esc(lead)}</p><p>${lines.map(esc).join('<br>')}</p>${pay ? `<p>${esc(pay)}</p>` : ''}<p style="color:#5b6472;font-size:13px">We’ll also send a short pre-visit health form to fill in for ${esc(d.athlete)} before their first session.</p>`,
      d.payUrl ? { label: 'Pay and confirm the place', url: d.payUrl } : undefined,
    ),
    entityType: 'academy_enrolment',
  });
  return r.status === 'sent' ? 'sent' : r.status === 'not_configured' ? 'not_configured' : 'failed';
}

// ------------------------------------------------------------------ staff
export async function staffAcademy() {
  const repo = db();
  const [sessions, enrolments] = await Promise.all([timetable(), repo.list('academy_enrolments', { orderBy: 'created_at', ascending: false, limit: 5000 })]);
  const customers = new Map((await Promise.all([...new Set(enrolments.map((e) => e.customer_id))].map((id) => repo.get('customers', id)))).filter((c): c is Customer => Boolean(c)).map((c) => [c.id, c]));
  const taken = takenBySession(enrolments);
  return {
    term: ACADEMY.term,
    sessions: sessions.map((s) => ({ ...s, taken: taken.get(s.id) ?? 0, waitlist: enrolments.filter((e) => e.status === 'waitlist' && e.session_ids.includes(s.id)).length })),
    enrolments: enrolments.map((e) => {
      const c = customers.get(e.customer_id);
      return { ...e, parent: c ? { id: c.id, full_name: c.full_name, email: c.email, phone: c.phone } : null };
    }),
  };
}

export const EnrolmentPatch = z
  .object({
    status: z.enum(['awaiting_payment', 'confirmed', 'waitlist', 'cancelled']).optional(),
    paid: z.boolean().optional(),
    payment_ref: z.string().trim().max(200).nullable().optional(),
    session_ids: z.array(z.string().uuid()).min(1).max(2).optional(),
    staff_note: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

export async function updateEnrolment(id: string, raw: unknown) {
  const p = EnrolmentPatch.parse(raw);
  const repo = db();
  const e = await repo.get('academy_enrolments', id);
  if (!e) throw new HttpError(404, 'Enrolment not found');
  const next: Partial<AcademyEnrolment> = {};
  if (p.session_ids) {
    const sessions = await timetable();
    const chosen = p.session_ids.map((sid) => sessions.find((s) => s.id === sid));
    if (chosen.some((s) => !s || s.group_key !== e.group_key)) throw new HttpError(422, 'Choose sessions from the athlete’s own group.');
    next.session_ids = p.session_ids;
  }
  if (p.paid !== undefined) {
    next.paid_at = p.paid ? new Date().toISOString() : null;
    if (p.paid && !p.status && e.status !== 'cancelled') next.status = 'confirmed';
  }
  if (p.status) next.status = p.status;
  if (p.payment_ref !== undefined) next.payment_ref = p.payment_ref || null;
  if (p.staff_note !== undefined) next.staff_note = p.staff_note || null;
  return repo.update('academy_enrolments', id, next);
}

export const SessionPatch = z.object({ capacity: z.number().int().min(1).max(100).optional(), active: z.boolean().optional() }).strict();
export async function updateSession(id: string, raw: unknown) {
  const p = SessionPatch.parse(raw);
  if (!(await db().get('academy_sessions', id))) throw new HttpError(404, 'Session not found');
  return db().update('academy_sessions', id, p);
}
