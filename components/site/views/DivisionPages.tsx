import Link from 'next/link';
import { IMAGES } from '@/lib/brand';
import type { PublicSiteData } from '@/lib/kb/service';
import { CLINIC_PAGES, DIVISIONS, type Division } from '@/lib/site/divisions';
import { EnquiryForm } from '../EnquiryForm';
import { Check, CtaBand, FeaturedOffer, NumberedCard, PageHero, PayLink, Section, SectionHeading, cx, featuredServices, priceText } from '../ui';

const TONES: Record<Division['key'], string> = {
  club: 'bg-royal text-white',
  clinic: 'bg-charcoal text-white',
  academy: 'bg-white text-charcoal border border-line',
  consulting: 'bg-mist text-charcoal',
};

/** ASPARC's four areas of business as cards – used on the home and about pages. */
export function DivisionGrid({ current }: { current?: Division['key'] }) {
  const list = current ? DIVISIONS.filter((d) => d.key !== current) : DIVISIONS;
  return (
    <div className={cx('grid gap-5 sm:grid-cols-2', list.length === 4 ? 'xl:grid-cols-4' : 'lg:grid-cols-3')}>
      {list.map((d) => {
        const dark = d.key === 'club' || d.key === 'clinic';
        return (
          <Link key={d.key} href={d.href} className={cx('group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] p-7 transition duration-300 hover:-translate-y-1', TONES[d.key])}>
            {dark && <div className="speed-lines absolute inset-0 opacity-60" aria-hidden="true" />}
            <div className="relative flex flex-1 flex-col">
              <span className={cx('font-display text-5xl font-extrabold', dark ? 'text-sky' : 'text-sky/60 group-hover:text-royal')}>{String(DIVISIONS.indexOf(d) + 1).padStart(2, '0')}</span>
              <p className={cx('eyebrow mt-4', dark ? 'text-sky-100' : 'text-royal')}>{d.who}</p>
              <h3 className="mt-2 text-2xl uppercase leading-tight">{d.name}</h3>
              <p className={cx('mt-3 text-[15px] leading-relaxed', dark ? 'text-white/75' : 'text-muted')}>{d.summary}</p>
              <ul className={cx('mt-5 flex-1 space-y-1.5 text-sm', dark ? 'text-white/85' : 'text-charcoal/85')}>
                {d.includes.map((x) => (
                  <li key={x} className="flex items-center gap-2.5">
                    <span className={cx('h-1.5 w-1.5 shrink-0 rotate-45', dark ? 'bg-sky' : 'bg-royal')} aria-hidden="true" />
                    {x}
                  </li>
                ))}
              </ul>
              <span className={cx('mt-6 font-display text-sm font-semibold uppercase tracking-wider', dark ? 'text-white' : 'text-royal')}>Explore {d.nav.toLowerCase()} →</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function Includes({ items }: { items: [string, string][] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {items.map(([t, d], i) => (
        <article key={t} className="card p-7">
          <span className="font-display text-4xl font-extrabold text-sky/50">{String(i + 1).padStart(2, '0')}</span>
          <h3 className="mt-3 text-2xl uppercase leading-tight">{t}</h3>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">{d}</p>
        </article>
      ))}
    </div>
  );
}

function OtherDivisions({ current }: { current: Division['key'] }) {
  return (
    <Section tone="mist">
      <SectionHeading eyebrow="More from ASPARC" title="Other ways we work" />
      <DivisionGrid current={current} />
    </Section>
  );
}

/* ---------------------------------------------------------------- */
export function ClubServicesView() {
  return (
    <>
      <PageHero
        eyebrow="Club Performance Services"
        title={<>Performance services <span className="text-sky">for your club.</span></>}
        intro="Strength & conditioning, sports science, physiotherapy and team testing – delivered for your club, your players and your season."
        image={IMAGES.testing}
      >
        <Link href="#enquire" className="btn-primary">Talk to us about your club</Link>
      </PageHero>
      <Section>
        <div className="grid gap-14 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionHeading
              eyebrow="What we provide"
              title={<>Your club’s <span className="text-royal">performance department.</span></>}
              intro="ASPARC brings the performance support of a professional football environment to clubs – from a single service to a full performance program across your teams."
            />
            <ul className="space-y-3 text-[15px]">
              <Check>One service or the full set</Check>
              <Check>Led by experience from professional football (Newcastle Jets, Avondale FC)</Check>
            </ul>
          </div>
          <div className="lg:col-span-7">
            <Includes
              items={[
                ['Strength & conditioning', 'Gym and field-based physical preparation – pre-season, in-season and off-season.'],
                ['Sports science', 'Training load, monitoring and data that help coaches plan and players stay available.'],
                ['Physiotherapy', 'Injury management and return-to-play support for your players.'],
                ['Team testing', 'Squad-wide athletic profiling with results and recommendations for each player.'],
              ]}
            />
          </div>
        </div>
      </Section>
      <Section tone="mist" id="enquire" className="scroll-mt-20">
        <div className="mx-auto max-w-3xl">
          <SectionHeading align="center" eyebrow="Club enquiries" title="Tell us about your club" intro="Let us know your club, your teams and what you’re after – we’ll be in touch to talk it through." />
          <div className="card p-6 sm:p-8">
            <EnquiryForm form="club" leadType="club_partnership" serviceInterest="Club Performance Services" />
          </div>
        </div>
      </Section>
      <OtherDivisions current="club" />
    </>
  );
}

/* ---------------------------------------------------------------- */
const CLINIC_TEXT: Record<string, string> = {
  '/sports-performance': '1-on-1 and small-group strength & conditioning, speed, agility, power and football-specific physical preparation.',
  '/rehabilitation': 'Exercise-based return-to-performance training that works alongside your treating practitioner.',
  '/recovery-remedial-massage': 'Remedial massage to support recovery, training load and performance.',
  '/performance-testing': 'Athletic profiling to identify strengths, gaps and training priorities.',
};

export function ClinicView({ site }: { site: PublicSiteData }) {
  const featured = featuredServices(site.services).filter((s) => s.category !== 'academy');
  const priced = site.services.filter((s) => s.category !== 'academy' && s.availability === 'available' && priceText(s));
  return (
    <>
      <PageHero
        eyebrow="ASPARC Sports Performance Centre"
        title={<>Train. Rehab. <span className="text-sky">Recover.</span></>}
        intro="Our centre at Avenger Park – 1-on-1 training, rehabilitation, remedial massage and performance testing for individual athletes."
        image={IMAGES.performance}
      >
        <Link href={site.onlineBooking ? '/book' : '/contact?form=booking'} className="btn-primary">{site.onlineBooking ? 'Book online' : 'Request a booking'}</Link>
      </PageHero>
      <Section>
        <SectionHeading eyebrow="At the clinic" title="Services at the centre" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {CLINIC_PAGES.map((p, i) => (
            <NumberedCard key={p.href} n={String(i + 1).padStart(2, '0')} title={p.label} text={CLINIC_TEXT[p.href] ?? ''} href={p.href} />
          ))}
        </div>
      </Section>
      {featured.map((s) => (
        <FeaturedOffer key={s.id} s={s} />
      ))}
      {priced.length > 0 && (
        <Section tone="mist">
          <SectionHeading eyebrow="Prices" title="Clinic price list" />
          <ul className="card divide-y divide-line">
            {priced.map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-3 px-6 py-4">
                <span className="font-display text-lg font-bold uppercase">{s.name}</span>
                <span className="flex items-baseline gap-4">
                  <span className="font-display text-lg font-bold text-royal">{priceText(s)}</span>
                  <PayLink s={s} className="text-sm font-semibold text-royal underline underline-offset-2 hover:text-charcoal" />
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <OtherDivisions current="clinic" />
    </>
  );
}

/* ---------------------------------------------------------------- */
export function ConsultingView() {
  return (
    <>
      <PageHero
        eyebrow="Consulting"
        title={<>Program design <span className="text-sky">&amp; consulting.</span></>}
        intro="Performance programs and advice for clubs, coaches and individual athletes – built on professional football high-performance experience."
        image={IMAGES.about}
      >
        <Link href="#enquire" className="btn-primary">Start a conversation</Link>
      </PageHero>
      <Section>
        <div className="grid gap-14 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionHeading
              eyebrow="What we offer"
              title={<>Expertise, <span className="text-royal">without the full-time hire.</span></>}
              intro="Whether you need a training program written, a club performance structure reviewed, or advice for an individual athlete, ASPARC can help."
            />
          </div>
          <div className="lg:col-span-7">
            <Includes
              items={[
                ['Program design', 'Training programs for teams and individuals – strength, conditioning, speed and season planning.'],
                ['Club consulting', 'Advice on your club’s performance setup, from player development pathways to staffing and testing.'],
                ['Individual consulting', 'One-to-one guidance for athletes, parents and coaches on training and development.'],
              ]}
            />
          </div>
        </div>
      </Section>
      <Section tone="mist" id="enquire" className="scroll-mt-20">
        <div className="mx-auto max-w-3xl">
          <SectionHeading align="center" eyebrow="Consulting enquiries" title="Tell us what you need" />
          <div className="card p-6 sm:p-8">
            <EnquiryForm form="contact" leadType="general" serviceInterest="Consulting – program design" />
          </div>
        </div>
      </Section>
      <OtherDivisions current="consulting" />
      <CtaBand title="Prefer to talk?" text="Send us a message and the ASPARC team will be in touch." primary={{ href: '/contact', label: 'Contact us' }} />
    </>
  );
}
