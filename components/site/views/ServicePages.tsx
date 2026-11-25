import Link from 'next/link';
import { IMAGES } from '@/lib/brand';
import type { Service } from '@/lib/db/types';
import type { PublicSiteData } from '@/lib/kb/service';
import { ACADEMY, ACADEMY_GROUPS } from '@/lib/academy/config';
import { AcademyEnrol } from '../AcademyEnrol';
import { EnquiryForm } from '../EnquiryForm';
import { Check, CtaBand, DraftBadge, FeaturedOffer, ImageSlot, OfferPrice, PageHero, PendingBadge, Section, SectionHeading, ServiceStatus, SpecialBadge, cx, enquireHref, featuredServices, isOnSpecial, priceText } from '../ui';

const opts = (site: PublicSiteData) => site.services.filter((s) => s.availability !== 'unavailable').map((s) => ({ name: s.name, category: s.category }));

function ServiceGrid({ services, numbered = true }: { services: Service[]; numbered?: boolean }) {
  // Featured specials lead the list.
  const ordered = [...services.filter((s) => s.is_featured), ...services.filter((s) => !s.is_featured)];
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {ordered.map((s, i) => {
        const special = s.is_featured || isOnSpecial(s);
        return (
          <article key={s.id} className={cx('card relative flex flex-col p-7', special && 'border-2 border-royal shadow-[0_18px_40px_-20px_rgba(20,81,156,0.55)]')}>
            <div className="flex items-start justify-between gap-3">
              {numbered && <span className="font-display text-4xl font-extrabold text-sky/50">{String(i + 1).padStart(2, '0')}</span>}
              {special && <SpecialBadge>{s.offer_label || 'Special'}</SpecialBadge>}
            </div>
            <h3 className="mt-3 text-2xl uppercase leading-tight">{s.name}</h3>
            <p className="mt-3 flex-1 text-[15px] leading-relaxed text-muted">{s.summary}</p>
            {special && priceText(s) ? (
              <div className="mt-5 border-t border-line pt-4">
                <OfferPrice s={s} size="md" />
                <Link href={enquireHref(s)} className="btn-primary mt-5 w-full">Claim your spot</Link>
              </div>
            ) : (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <span className="font-display text-lg font-bold">{priceText(s) ?? 'Pricing on enquiry'}</span>
                <ServiceStatus s={s} />
              </div>
            )}
          </article>
        );
      })}
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
  const featured = featuredServices(services);
  return (
    <>
      <PageHero eyebrow="Sports Performance" title={<>Stronger. Faster. <span className="text-sky">More robust.</span></>} intro="Individualised strength and conditioning, speed and power development for athletes who want to perform at their best – from professional footballers to adults building strength for life." image={IMAGES.performance}>
        <Link href="#request" className="btn-primary">Request a session</Link>
        <Link href="/performance-testing" className="btn-outline">Performance testing</Link>
      </PageHero>
      {featured.map((s, i) => (
        <FeaturedOffer key={s.id} s={s} id={i === 0 ? 'special' : undefined} showMore={false} />
      ))}
      <Section>
        <SectionHeading eyebrow="What we offer" title="Performance services" intro="Programs are built around your sport, your training history and your goals. Where a price isn’t shown, it’s provided on enquiry while packages are finalised." />
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
// Age-group names, aims and training focus are taken from ASPARC's own program flyers.
export function AcademyView({ site }: { site: PublicSiteData }) {
  const program = site.services.find((s) => s.category === 'academy');
  return (
    <>
      <PageHero
        eyebrow={`Now enrolling · ${ACADEMY.term}`}
        title={<>ASPARC Football <span className="text-sky">Performance Academy</span></>}
        intro={`Speed, strength, agility and athletic development for young footballers aged 8–16. Small groups of ${ACADEMY.capacity}, six days a week at ${ACADEMY.venue}.`}
        image={IMAGES.academy}
      >
        <Link href="#enrol" className="btn-primary">Enrol now</Link>
        <Link href="#timetable" className="btn-outline">See the timetable</Link>
      </PageHero>
      <Section>
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <SectionHeading eyebrow="The Academy" title="Develop the athlete, not just the player." intro="Each group trains to an age-appropriate plan so young footballers build speed, strength and movement skills safely – and enjoy it. Choose the group for your child’s age, the days that suit your family, and how often they train." />
            <ul className="grid gap-3 text-[15px] sm:grid-cols-2">
              <Check>Three age groups: 8–11, 11–13 and 14–16</Check>
              <Check>50-minute sessions, Monday to Saturday</Check>
              <Check>No more than {ACADEMY.capacity} athletes per session</Check>
              <Check>1 or 2 sessions a week, annual or casual</Check>
              <Check>Strength, speed, agility, coordination &amp; power</Check>
              <Check>Coached by ASPARC’s high-performance team</Check>
            </ul>
          </div>
          {program && (
            <aside className="lg:col-span-5">
              <div className="rounded-2xl bg-charcoal p-8 text-white">
                <p className="eyebrow">10-week term from</p>
                <div className="mt-3">
                  <OfferPrice s={program} dark />
                </div>
                {program.price_status === 'draft' && <DraftBadge className="mt-4" />}
                <p className="mt-6 text-sm leading-relaxed text-white/70">2 sessions a week, annual and casual options below. Places are held as soon as you enrol.</p>
                <Link href="#enrol" className="btn-primary mt-6 w-full">Enrol now</Link>
              </div>
            </aside>
          )}
        </div>
      </Section>
      <Section tone="mist">
        <SectionHeading eyebrow="Age groups" title="The right training at the right stage" intro="11-year-olds can join Foundation Movers or Athletic Development – choose whichever suits your child best." />
        <div className="grid gap-5 md:grid-cols-3">
          {ACADEMY_GROUPS.map((g) => (
            <article key={g.key} className="card flex flex-col overflow-hidden border-t-[6px]" style={{ borderTopColor: g.colour }}>
              <div className="relative aspect-[4/3] bg-charcoal">
                {/* Decorative: the heading below names the age group. */}
                <img src={g.image} alt="" loading="lazy" width={800} height={1000} className={`absolute inset-0 h-full w-full object-cover ${g.position}`} />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-charcoal via-charcoal/70 to-transparent px-6 pb-5 pt-16 text-white">
                  <p className="font-display text-5xl font-extrabold leading-none">{g.ages}</p>
                  <p className="mt-1 text-xs uppercase tracking-widest text-white/75">years</p>
                </div>
              </div>
              <div className="flex-1 p-6">
                <h3 className="text-xl uppercase">{g.name}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{g.text}</p>
                <p className="eyebrow mt-5">Training focus</p>
                <ul className="mt-2 space-y-1.5 text-sm text-charcoal">
                  {g.focus.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: g.colour }} aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </Section>
      <AcademyEnrol />
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
        {site.onlineBooking && <Link href="/book" className="btn-primary">Book online</Link>}
        <Link href="#enquire" className={site.onlineBooking ? 'btn-outline' : 'btn-primary'}>Appointment enquiry</Link>
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
        <Link href="#enquire" className="btn-primary">Enquire about testing</Link>
      </PageHero>
      <Section>
        <SectionHeading eyebrow="Why test" title="Training decisions, informed" intro="Testing turns ‘I think’ into ‘we know’. A clear profile of an athlete’s physical qualities helps prioritise training, monitor development and track return-to-performance progress. We profile our players and make recommendations on how to improve deficits." />
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
      <CtaBand title="Work with ASPARC" text="Athletes, parents and clubs – we’d love to hear from you." primary={{ href: '/contact', label: 'Contact us' }} secondary={{ href: '/club-performance-services', label: 'Club Performance Services' }} />
    </>
  );
}
