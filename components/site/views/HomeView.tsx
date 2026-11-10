import Link from 'next/link';
import { BRAND, IMAGES } from '@/lib/brand';
import type { PublicSiteData } from '@/lib/kb/service';
import { Check, CtaBand, DraftBadge, ImageSlot, NumberedCard, Section, SectionHeading, priceText } from '../ui';

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
            <Link href="/performance-academy" className="btn-outline">Performance Academy</Link>
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
          <NumberedCard n="02" title="Performance Academy" text="A 10-week athletic development program for juniors aged 8–18 across four age groups." href="/performance-academy" />
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
      <section className="relative overflow-hidden bg-charcoal text-white">
        <div className="speed-lines absolute inset-0" aria-hidden="true" />
        <div className="container-x relative grid gap-12 py-24 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="eyebrow mb-3">Performance Academy</p>
            <h2 className="text-5xl uppercase leading-[0.92] sm:text-6xl">
              Develop the athlete <span className="text-sky">before the specialist.</span>
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">
              A structured 10-week block for young athletes focused on strength, speed, agility, coordination, power and all-round athletic development.
            </p>
            <ul className="mt-8 grid max-w-md grid-cols-2 gap-3">
              {['8–10', '11–13', '14–16', '16–18'].map((g) => (
                <li key={g} className="rounded-lg border border-white/15 bg-white/5 px-4 py-3">
                  <span className="block font-display text-3xl font-bold">{g}</span>
                  <span className="text-xs uppercase tracking-wider text-white/60">years</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-white p-8 text-charcoal shadow-2xl sm:p-10">
            <dl className="grid grid-cols-3 gap-4 border-b border-line pb-8">
              {[
                ['10', 'weeks'],
                ['1', 'session / week'],
                ['45–60', 'minutes'],
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
                <p className="font-display text-5xl font-extrabold">
                  {priceText(academy)} <span className="text-lg font-semibold text-muted">{academy.price_unit}</span>
                </p>
                {academy.price_status === 'draft' && <DraftBadge className="mt-3" />}
              </div>
            )}
            <ul className="mt-8 space-y-3 text-[15px]">
              <Check>Parent and guardian registration pathway</Check>
              <Check>Age-appropriate athletic development</Check>
              <Check>Strength · speed · agility · coordination · power</Check>
            </ul>
            <Link href="/performance-academy#register" className="btn-primary mt-8 w-full">Register interest</Link>
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
