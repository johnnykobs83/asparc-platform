import Link from 'next/link';
import { ACADEMY, ACADEMY_GROUPS } from '@/lib/academy/config';
import { BRAND, IMAGES } from '@/lib/brand';
import type { PublicSiteData } from '@/lib/kb/service';
import { Check, CtaBand, DraftBadge, FeaturedOffer, ImageSlot, NumberedCard, Section, SectionHeading, featuredServices, priceText } from '../ui';

const AUDIENCES = ['Professional & semi-pro athletes', 'Football (soccer) players', 'Junior & youth athletes', 'Community sporting clubs', 'Adults building strength & fitness'];

const PILLARS = [
  { word: 'Perform', text: 'Strength, speed, power and conditioning built for your sport.' },
  { word: 'Develop', text: 'Long-term athletic development for juniors and aspiring athletes.' },
  { word: 'Return', text: 'Exercise-based return-to-performance, alongside your practitioner.' },
  { word: 'Recover', text: 'Remedial massage and recovery to keep you training.' },
];

export function HomeView({ site }: { site: PublicSiteData }) {
  const academy = site.services.find((s) => s.category === 'academy');
  const founder = site.kb['business.founder'];
  const featured = featuredServices(site.services);

  return (
    <>
      {/* HERO */}
      <ImageSlot src={IMAGES.hero} className="text-white" label="Athlete training at ASPARC">
        <div className="container-x relative flex min-h-[calc(100svh-84px)] flex-col justify-center py-20">
          <p className="eyebrow mb-6 flex items-center gap-3">
            <span className="h-px w-10 bg-sky" aria-hidden="true" /> Melbourne · Sports Performance &amp; Rehabilitation
          </p>
          <h1 className="max-w-5xl text-[clamp(2.5rem,11vw,9.5rem)] uppercase leading-[0.82] tracking-tight">
            High
            <br />
            performance
            <br />
            starts <span className="text-sky">here.</span>
          </h1>
          <p className="mt-8 max-w-xl text-xl leading-relaxed text-white/80">{BRAND.supporting}</p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/contact" className="btn-primary">Enquire now</Link>
            <Link href="/performance-academy" className="btn-outline">Football Academy – now enrolling</Link>
          </div>
        </div>
        <div className="relative border-t border-white/10 bg-charcoal/60 backdrop-blur">
          <ul className="container-x flex flex-wrap gap-x-8 gap-y-2 py-5 font-display text-sm font-semibold uppercase tracking-[0.14em] text-white/70">
            {AUDIENCES.map((a) => (
              <li key={a} className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 rotate-45 bg-sky" aria-hidden="true" />
                {a}
              </li>
            ))}
          </ul>
        </div>
      </ImageSlot>

      {/* FEATURED SPECIALS */}
      {featured.map((s) => (
        <FeaturedOffer key={s.id} s={s} />
      ))}

      {/* WHAT IS ASPARC */}
      <Section>
        <div className="grid gap-14 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-6">
            <SectionHeading
              eyebrow="What is ASPARC"
              title={<>One centre for <span className="text-royal">performance, development &amp; return.</span></>}
              intro={site.kb['business.overview']?.content}
            />
            <Link href="/about" className="btn-outline-dark">About ASPARC</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-6">
            {PILLARS.map((p, i) => (
              <div key={p.word} className={`rounded-[var(--radius-card)] p-7 ${i % 3 === 0 ? 'bg-charcoal text-white' : 'bg-mist'}`}>
                <p className={`font-display text-4xl font-extrabold uppercase ${i % 3 === 0 ? 'text-sky' : 'text-royal'}`}>{p.word}</p>
                <p className={`mt-3 text-[15px] leading-relaxed ${i % 3 === 0 ? 'text-white/75' : 'text-muted'}`}>{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* SERVICES */}
      <Section tone="mist">
        <SectionHeading eyebrow="Services" title="Built around the athlete" intro="Every program starts with what you need – whether that’s your first strength program, a pre-season block, or the final stage of returning from injury." />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <NumberedCard n="01" title="Sports Performance" text="Strength & conditioning, speed, agility, power and football-specific physical preparation." href="/sports-performance" />
          <NumberedCard n="02" title="Football Performance Academy" text="Small-group athletic development for footballers aged 8–16, six days a week. Now enrolling for Term 1 2027." href="/performance-academy" />
          <NumberedCard n="03" title="Rehabilitation" text="Exercise-based return-to-performance training that works alongside your treating practitioner." href="/rehabilitation" />
          <NumberedCard n="04" title="Recovery & Massage" text="Remedial massage to support recovery, training load and performance." href="/recovery-remedial-massage" />
          <NumberedCard n="05" title="Performance Testing" text="Athletic profiling to identify strengths, gaps and training priorities." href="/performance-testing" />
          <Link href="/contact?form=club" className="group relative flex flex-col justify-between overflow-hidden rounded-[var(--radius-card)] bg-royal p-7 text-white">
            <div className="speed-lines absolute inset-0" aria-hidden="true" />
            <div className="relative">
              <p className="eyebrow text-sky-100">For clubs</p>
              <h3 className="mt-4 text-2xl uppercase leading-tight">Club partnerships</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-white/80">Physical preparation support for community sporting clubs and their players.</p>
            </div>
            <span className="relative mt-6 font-display text-sm font-semibold uppercase tracking-wider">Talk to us →</span>
          </Link>
        </div>
      </Section>

      {/* ACADEMY */}
      <section className="relative overflow-hidden bg-charcoal text-white" aria-label={ACADEMY.name}>
        <div className="speed-lines absolute inset-0" aria-hidden="true" />
        <div className="container-x relative grid gap-12 py-24 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="eyebrow mb-3">Now enrolling · {ACADEMY.term}</p>
            <h2 className="text-5xl uppercase leading-[0.92] sm:text-6xl">
              ASPARC Football <span className="text-sky">Performance Academy</span>
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">
              Speed, strength, agility and athletic development for young footballers aged 8–16 – in small groups of {ACADEMY.capacity}, six days a week at {ACADEMY.venue}.
            </p>
            <ul className="mt-8 grid max-w-lg gap-3 sm:grid-cols-3">
              {ACADEMY_GROUPS.map((g) => (
                <li key={g.key} className="rounded-lg border border-white/15 border-l-4 bg-white/5 px-4 py-3" style={{ borderLeftColor: g.colour }}>
                  <span className="block font-display text-3xl font-bold">{g.ages}</span>
                  <span className="text-xs uppercase tracking-wider text-white/70">{g.name}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-white p-8 text-charcoal shadow-2xl sm:p-10">
            <dl className="grid grid-cols-3 gap-4 border-b border-line pb-8">
              {[
                ['6', 'days a week'],
                ['50', 'minute sessions'],
                [String(ACADEMY.capacity), 'per group'],
              ].map(([v, l]) => (
                <div key={l}>
                  <dt className="sr-only">{l}</dt>
                  <dd>
                    <span className="block font-display text-4xl font-extrabold text-royal">{v}</span>
                    <span className="text-xs uppercase tracking-wider text-muted">{l}</span>
                  </dd>
                </div>
              ))}
            </dl>
            {academy && priceText(academy) && (
              <div className="mt-8">
                <p className="text-sm uppercase tracking-wider text-muted">10-week term from</p>
                <p className="font-display text-5xl font-extrabold">{priceText(academy)}</p>
                {academy.price_status === 'draft' && <DraftBadge className="mt-3" />}
              </div>
            )}
            <ul className="mt-8 space-y-3 text-[15px]">
              <Check>1 or 2 sessions a week, annual or casual</Check>
              <Check>Choose the days that suit your family</Check>
              <Check>Strength · speed · agility · coordination · power</Check>
            </ul>
            <Link href="/performance-academy#enrol" className="btn-primary mt-8 w-full">Enrol now</Link>
          </div>
        </div>
      </section>

      {/* FOUNDER */}
      <Section>
        <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
          <ImageSlot src={IMAGES.founder} overlay="royal" className="aspect-[4/5] rounded-2xl lg:col-span-5" label="John Kobiela, ASPARC founder">
            <div className="absolute bottom-0 left-0 p-7 text-white">
              <p className="font-display text-3xl font-bold uppercase leading-none">John Kobiela</p>
              <p className="mt-1 text-sm text-white/75">Founder</p>
            </div>
          </ImageSlot>
          <div className="lg:col-span-7">
            <p className="eyebrow mb-3 text-royal">Founder</p>
            <h2 className="text-4xl uppercase leading-[0.95] sm:text-5xl">Professional football high performance, brought to every athlete.</h2>
            <p className="mt-6 text-lg leading-relaxed text-muted">{founder?.content}</p>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              <Check>Master of High Performance (2017)</Check>
              <Check>Bachelor of Exercise Science &amp; Human Movement (2010)</Check>
              <Check>High performance – Newcastle Jets</Check>
              <Check>High performance – Avondale FC</Check>
            </ul>
            <Link href="/about" className="btn-outline-dark mt-10">Read more</Link>
          </div>
        </div>
      </Section>

      <CtaBand
        title="Ready to start?"
        text="Tell us about your goals and the ASPARC team will be in touch – or ask ASPARC AI any time."
        primary={{ href: '/contact', label: 'Send an enquiry' }}
        secondary={{ href: '/contact?form=booking', label: 'Request a booking' }}
      />
    </>
  );
}
