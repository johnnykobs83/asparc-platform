import Link from 'next/link';
import { IMAGES } from '@/lib/brand';
import type { Service } from '@/lib/db/types';
import type { PublicSiteData } from '@/lib/kb/service';
import { EnquiryForm } from '../EnquiryForm';
import { Check, CtaBand, DraftBadge, ImageSlot, PageHero, PendingBadge, Section, SectionHeading, ServiceStatus, priceText } from '../ui';

const opts = (site: PublicSiteData) => site.services.filter((s) => s.availability !== 'unavailable').map((s) => ({ name: s.name, category: s.category }));

function ServiceGrid({ services, numbered = true }: { services: Service[]; numbered?: boolean }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {services.map((s, i) => (
        <article key={s.id} className="card flex flex-col p-7">
          {numbered && <span className="font-display text-4xl font-extrabold text-sky/50">{String(i + 1).padStart(2, '0')}</span>}
          <h3 className="mt-3 text-2xl uppercase leading-tight">{s.name}</h3>
          <p className="mt-3 flex-1 text-[15px] leading-relaxed text-muted">{s.summary}</p>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <span className="font-display text-lg font-bold">{priceText(s) ?? 'Pricing on enquiry'}</span>
            <ServiceStatus s={s} />
          </div>
        </article>
      ))}
    </div>
  );
}

function Steps({ steps, dark = false }: { steps: [string, string][]; dark?: boolean }) {
  return (
    <ol className="grid gap-px overflow-hidden rounded-[var(--radius-card)] bg-line sm:grid-cols-2 lg:grid-cols-4">
      {steps.map(([t, d], i) => (
        <li key={t} className={dark ? 'bg-charcoal-700 p-7' : 'bg-white p-7'}>
          <span className="font-display text-sm font-bold uppercase tracking-widest text-royal">Step {i + 1}</span>
          <h3 className="mt-2 text-xl uppercase">{t}</h3>
          <p className={`mt-2 text-[15px] leading-relaxed ${dark ? 'text-white/70' : 'text-muted'}`}>{d}</p>
        </li>
      ))}
    </ol>
  );
}

/* ---------------------------------------------------------------- */
export function SportsPerformanceView({ site }: { site: PublicSiteData }) {
  const services = site.services.filter((s) => s.category === 'performance');
  return (
    <>
      <PageHero eyebrow="Sports Performance" title={<>Stronger. Faster. <span className="text-sky">More robust.</span></>} intro="Individualised strength and conditioning, speed and power development for athletes who want to perform at their best – from professional footballers to adults building strength for life." image={IMAGES.performance}>
        <Link href="#request" className="btn-primary">Request a session</Link>
        <Link href="/performance-testing" className="btn-outline">Performance testing</Link>
      </PageHero>
      <Section>
        <SectionHeading eyebrow="What we offer" title="Performance services" intro="Programs are built around your sport, your training history and your goals. Pricing is provided on enquiry while packages are finalised." />
        <ServiceGrid services={services} />
      </Section>
      <Section tone="mist">
        <SectionHeading eyebrow="How it works" title="A clear process" />
        <Steps
          steps={[
            ['Enquire', 'Tell us about your sport, goals, schedule and training background.'],
            ['Profile', 'We look at where you are now to set clear training priorities.'],
            ['Train', 'Coached sessions and a structured program built around your season.'],
            ['Review', 'Progress is reviewed and the program adjusted as you develop.'],
          ]}
        />
      </Section>
      <Section>
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <SectionHeading eyebrow="Football-specific" title="Prepared for the demands of the game" intro="Football asks for repeated sprints, rapid changes of direction, physical contests and the ability to keep producing late in a match. Physical preparation is built around those demands across pre-season, in-season and off-season." />
            <ul className="space-y-3 text-[15px]">
              <Check>Acceleration and sprint mechanics</Check>
              <Check>Agility, deceleration and change of direction</Check>
              <Check>Strength and power for duels, jumping and striking</Check>
              <Check>Individual development for aspiring and professional players</Check>
            </ul>
          </div>
          <div id="request" className="card scroll-mt-28 p-6 sm:p-8">
            <EnquiryForm form="booking" leadType="sports_performance" services={opts(site).filter((s) => s.category === 'performance')} />
          </div>
        </div>
      </Section>
    </>
  );
}

/* ---------------------------------------------------------------- */
const AGE_DETAILS = [
  ['8–10', 'Foundations', 'Fundamental movement skills, coordination, balance and running technique – delivered through engaging, game-based training.'],
  ['11–13', 'Athletic development', 'Speed, agility and coordination with an introduction to bodyweight strength and correct technique.'],
  ['14–16', 'Strength & power', 'Building strength foundations, jumping, landing and sprint mechanics as athletes grow.'],
  ['16–18', 'Performance preparation', 'Structured strength, power and speed training to prepare for senior and higher-level competition.'],
] as const;

export function AcademyView({ site }: { site: PublicSiteData }) {
  const program = site.services.find((s) => s.category === 'academy');
  return (
    <>
      <PageHero eyebrow="Performance Academy" title={<>Building better <span className="text-sky">young athletes.</span></>} intro="A 10-week athletic development program for junior athletes aged 8–18, focused on strength, speed, agility, coordination, power and long-term athletic development." image={IMAGES.academy}>
        <Link href="#register" className="btn-primary">Register interest</Link>
      </PageHero>
      <Section>
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <SectionHeading eyebrow="The program" title="10 weeks. One session a week." intro="Each Academy block is designed to develop well-rounded athletes – not just better players in one sport. Training is grouped by age so every session is appropriate for the athlete’s stage of development." />
            <ul className="grid gap-3 text-[15px] sm:grid-cols-2">
              <Check>10-week training block</Check>
              <Check>One session per week</Check>
              <Check>45–60 minutes per session</Check>
              <Check>Four age groups: 8–10, 11–13, 14–16, 16–18</Check>
              <Check>Strength, speed, agility, coordination &amp; power</Check>
              <Check>Parent/guardian registration and communication</Check>
            </ul>
          </div>
          {program && (
            <aside className="lg:col-span-5">
              <div className="rounded-2xl bg-charcoal p-8 text-white">
                <p className="eyebrow">Program fee</p>
                <p className="mt-3 font-display text-6xl font-extrabold">{priceText(program) ?? 'On enquiry'}</p>
                <p className="text-white/60">{program.price_unit}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {program.price_status === 'draft' && <DraftBadge />}
                  {program.availability === 'pending_confirmation' && <PendingBadge>Program dates being confirmed</PendingBadge>}
                </div>
                <p className="mt-6 text-sm leading-relaxed text-white/70">Registering interest does not commit you to payment. The team will contact you with confirmed dates, location and payment details.</p>
                <Link href="#register" className="btn-primary mt-6 w-full">Register interest</Link>
              </div>
            </aside>
          )}
        </div>
      </Section>
      <Section tone="mist">
        <SectionHeading eyebrow="Age groups" title="The right training at the right stage" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {AGE_DETAILS.map(([age, title, text]) => (
            <article key={age} className="card overflow-hidden">
              <div className="speed-lines bg-royal px-6 py-6 text-white">
                <p className="font-display text-5xl font-extrabold leading-none">{age}</p>
                <p className="mt-1 text-xs uppercase tracking-widest text-white/70">years</p>
              </div>
              <div className="p-6">
                <h3 className="text-xl uppercase">{title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{text}</p>
              </div>
            </article>
          ))}
        </div>
      </Section>
      <Section id="register" className="scroll-mt-20">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <SectionHeading eyebrow="For parents & guardians" title="Register your interest" intro="Complete the form and the ASPARC team will contact you with program dates and next steps." />
            <ul className="space-y-3 text-[15px] text-muted">
              <Check>Registrations are completed by a parent or guardian</Check>
              <Check>We only use your details to respond to your registration</Check>
              <Check>No payment is taken online at this stage</Check>
            </ul>
          </div>
          <div className="card p-6 sm:p-8 lg:col-span-8">
            <EnquiryForm form="academy" leadType="academy" serviceInterest={program?.name} />
          </div>
        </div>
      </Section>
    </>
  );
}

/* ---------------------------------------------------------------- */
export function RehabilitationView({ site }: { site: PublicSiteData }) {
  const rtp = site.services.find((s) => s.category === 'rehabilitation');
  return (
    <>
      <PageHero eyebrow="Rehabilitation" title={<>Return <span className="text-sky">stronger.</span></>} intro="Exercise-based return-to-performance training that bridges the gap between injury rehabilitation and full training – delivered alongside your treating doctor or physiotherapist." image={IMAGES.rehab}>
        <Link href="#enquire" className="btn-primary">Enquire</Link>
      </PageHero>
      <Section>
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <SectionHeading eyebrow="Return to performance" title="From cleared to competition-ready" intro={rtp?.summary} />
            <p className="text-[15px] leading-relaxed text-muted">The final stages of returning from injury are often where athletes need the most structured support – rebuilding strength, speed and confidence so they can handle the demands of full training and competition again.</p>
          </div>
          <div className="grid gap-4">
            <div className="rounded-[var(--radius-card)] border border-success/25 bg-[#f1faf5] p-7">
              <h3 className="text-xl uppercase text-success">What ASPARC provides</h3>
              <ul className="mt-4 space-y-2.5 text-[15px]">
                <Check>Progressive, exercise-based strength and conditioning</Check>
                <Check>Return-to-running, speed and change-of-direction progressions</Check>
                <Check>Rebuilding sport-specific physical capacity</Check>
                <Check>Working alongside your treating practitioner’s guidance</Check>
              </ul>
            </div>
            <div className="rounded-[var(--radius-card)] border border-line bg-mist p-7">
              <h3 className="text-xl uppercase">What ASPARC does not provide</h3>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-[15px] text-muted">
                <li>Injury diagnosis or medical assessment</li>
                <li>Physiotherapy or other registered clinical treatment</li>
                <li>Medical treatment or prescriptions</li>
              </ul>
              <p className="mt-4 text-sm text-muted">If you have a new or undiagnosed injury, please see your doctor or a registered physiotherapist first. In an emergency call 000.</p>
            </div>
          </div>
        </div>
      </Section>
      <Section tone="mist">
        <SectionHeading eyebrow="The pathway" title="How return-to-performance works" />
        <Steps
          steps={[
            ['Assessment & clearance', 'Your doctor or physiotherapist assesses the injury and guides early rehabilitation.'],
            ['Plan', 'We build a training plan that aligns with your practitioner’s guidance and your sport.'],
            ['Progressive loading', 'Strength, running and power are rebuilt step by step.'],
            ['Return to training', 'Bridging back into full team training and competition.'],
          ]}
        />
      </Section>
      <Section id="enquire" className="scroll-mt-20">
        <div className="mx-auto max-w-3xl card p-6 sm:p-8">
          <EnquiryForm form="contact" leadType="rehabilitation" serviceInterest={rtp?.name ?? 'Return-to-performance training'} />
        </div>
      </Section>
    </>
  );
}

/* ---------------------------------------------------------------- */
export function RecoveryView({ site }: { site: PublicSiteData }) {
  const massage = site.services.filter((s) => s.category === 'recovery');
  const anyDraft = massage.some((m) => m.price_status === 'draft');
  const anyPending = massage.some((m) => m.availability === 'pending_confirmation');
  return (
    <>
      <PageHero eyebrow="Recovery & Remedial Massage" title={<>Recover well. <span className="text-sky">Train well.</span></>} intro="Remedial massage to support recovery between sessions, manage training load and help you feel ready to perform." image={IMAGES.recovery}>
        <Link href="#enquire" className="btn-primary">Appointment enquiry</Link>
      </PageHero>
      <Section>
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <SectionHeading eyebrow="Remedial massage" title="Targeted, hands-on recovery" intro="Remedial massage sessions are available in 30, 45 and 60 minute options, so you can choose a focused treatment or a full session." />
            <ul className="space-y-3 text-[15px]">
              <Check>Support recovery from training and competition</Check>
              <Check>Address areas of muscular tightness</Check>
              <Check>Fits around your training schedule</Check>
            </ul>
          </div>
          <div className="lg:col-span-6">
            <div className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-charcoal px-6 py-4 text-white">
                <h3 className="text-xl uppercase">Session pricing</h3>
                <div className="flex flex-wrap gap-2">
                  {anyDraft && <DraftBadge />}
                </div>
              </div>
              <table className="w-full text-left">
                <caption className="sr-only">Remedial massage pricing</caption>
                <thead className="sr-only">
                  <tr><th>Session</th><th>Price</th></tr>
                </thead>
                <tbody>
                  {massage.map((m) => (
                    <tr key={m.id} className="border-b border-line last:border-0">
                      <td className="px-6 py-5">
                        <span className="font-display text-2xl font-bold">{m.duration_minutes} min</span>
                        <span className="block text-sm text-muted">{m.name.replace(/ – \d+ minutes/, '')}</span>
                      </td>
                      <td className="px-6 py-5 text-right font-display text-3xl font-extrabold text-royal">{priceText(m) ?? 'On enquiry'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {anyPending && (
                <div className="border-t border-line bg-mist px-6 py-4">
                  <PendingBadge>Practitioner availability being confirmed</PendingBadge>
                  <p className="mt-2 text-sm text-muted">Send an enquiry and we’ll contact you when appointments are available.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </Section>
      <Section tone="mist" id="enquire" className="scroll-mt-20">
        <div className="mx-auto max-w-3xl card p-6 sm:p-8">
          <EnquiryForm form="massage" leadType="massage" services={opts(site)} />
        </div>
      </Section>
    </>
  );
}

/* ---------------------------------------------------------------- */
export function TestingView({ site }: { site: PublicSiteData }) {
  const tests = site.services.filter((s) => s.category === 'testing');
  const confirmed = tests.filter((t) => t.availability === 'available');
  const planned = tests.filter((t) => t.availability === 'pending_confirmation');
  return (
    <>
      <PageHero eyebrow="Performance Testing" title={<>Measure. Understand. <span className="text-sky">Improve.</span></>} intro="Athletic profiling helps identify strengths, gaps and training priorities – and shows progress over time." image={IMAGES.testing}>
        <Link href="#enquire" className="btn-primary">Register interest</Link>
      </PageHero>
      <Section>
        <SectionHeading eyebrow="Why test" title="Training decisions, informed" intro="Testing turns ‘I think’ into ‘we know’. A clear profile of an athlete’s physical qualities helps prioritise training, monitor development and track return-to-performance progress." />
        {confirmed.length > 0 && (
          <>
            <h3 className="mb-5 text-2xl uppercase">Available assessments</h3>
            <ServiceGrid services={confirmed} numbered={false} />
          </>
        )}
        {planned.length > 0 && (
          <div className={confirmed.length ? 'mt-14' : ''}>
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <h3 className="text-2xl uppercase">Planned testing areas</h3>
              <PendingBadge>Menu being finalised</PendingBadge>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {planned.map((t) => (
                <li key={t.id} className="rounded-[var(--radius-card)] border border-dashed border-sky/60 bg-sky-100/40 p-5">
                  <p className="font-display text-xl font-bold uppercase">{t.name.replace(/ Testing| Assessment/, '')}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{t.summary}</p>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm text-muted">These areas are planned and are not yet confirmed as available. Register your interest and the team will confirm which assessments are offered.</p>
          </div>
        )}
      </Section>
      <Section tone="mist" id="enquire" className="scroll-mt-20">
        <div className="mx-auto max-w-3xl card p-6 sm:p-8">
          <EnquiryForm form="contact" leadType="testing" serviceInterest="Performance testing" />
        </div>
      </Section>
      <CtaBand title="Train with purpose" text="Combine testing with a structured performance program." primary={{ href: '/sports-performance', label: 'Sports performance' }} />
    </>
  );
}

/* ---------------------------------------------------------------- */
export function AboutView({ site }: { site: PublicSiteData }) {
  return (
    <>
      <PageHero eyebrow="About ASPARC" title={<>Australian Sports Performance <span className="text-sky">&amp; Rehabilitation Centre</span></>} intro={site.kb['business.overview']?.content ?? ''} image={IMAGES.about} />
      <Section>
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <SectionHeading eyebrow="Our purpose" title="High performance starts here." intro="Unlock your potential. Develop your performance. Return stronger." />
            <p className="text-[15px] leading-relaxed text-muted">ASPARC brings professional high-performance practice to every athlete who walks through the door – whether they are a professional footballer, a junior just starting their athletic journey, a community club, or an adult wanting to get stronger and move better.</p>
          </div>
          <div>
            <h3 className="mb-4 text-2xl uppercase">Who we work with</h3>
            <ul className="space-y-3 text-[15px]">
              <Check>Professional and semi-professional athletes</Check>
              <Check>Football (soccer) players</Check>
              <Check>Junior and youth athletes</Check>
              <Check>Community sporting clubs</Check>
              <Check>Adults seeking strength, conditioning and improved physical performance</Check>
            </ul>
          </div>
        </div>
      </Section>
      <Section tone="dark" className="overflow-hidden">
        <div className="speed-lines absolute inset-0" aria-hidden="true" />
        <div className="relative grid gap-12 lg:grid-cols-12 lg:items-center">
          <ImageSlot src={IMAGES.founder} overlay="royal" className="aspect-[4/5] rounded-2xl lg:col-span-5" label="John Kobiela" />
          <div className="lg:col-span-7">
            <p className="eyebrow mb-3">Founder</p>
            <h2 className="text-5xl uppercase leading-none">John Kobiela</h2>
            <p className="mt-6 text-lg leading-relaxed text-white/75">{site.kb['business.founder']?.content}</p>
            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              <div>
                <h3 className="eyebrow mb-3">Qualifications</h3>
                <ul className="space-y-2.5 text-[15px] text-white/85">
                  <Check dark>Master of High Performance (2017)</Check>
                  <Check dark>Bachelor of Exercise Science and Human Movement (2010)</Check>
                </ul>
              </div>
              <div>
                <h3 className="eyebrow mb-3">Professional football</h3>
                <ul className="space-y-2.5 text-[15px] text-white/85">
                  <Check dark>Newcastle Jets</Check>
                  <Check dark>Avondale FC</Check>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </Section>
      <Section>
        <SectionHeading eyebrow="Our standards" title="How we work" />
        <div className="grid gap-5 md:grid-cols-3">
          {[
            ['Athlete first', 'Programs are built around the individual – their sport, stage, goals and schedule.'],
            ['Within our scope', 'We are clear about what we do and work alongside doctors and registered practitioners for anything clinical.'],
            ['Safe & transparent', 'Clear communication with athletes and parents, honest pricing, and careful handling of personal information.'],
          ].map(([t, d]) => (
            <div key={t} className="card p-7">
              <h3 className="text-2xl uppercase text-royal">{t}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">{d}</p>
            </div>
          ))}
        </div>
      </Section>
      <CtaBand title="Work with ASPARC" text="Athletes, parents and clubs – we’d love to hear from you." primary={{ href: '/contact', label: 'Contact us' }} secondary={{ href: '/contact?form=club', label: 'Club partnerships' }} />
    </>
  );
}
