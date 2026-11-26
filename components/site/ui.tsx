import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Service } from '@/lib/db/types';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/**
 * Photography slot. Uses the photo at `src` if it exists in /public/images,
 * otherwise falls back to the branded duotone treatment underneath – so the
 * site always looks finished, and real photography drops straight in.
 */
export function ImageSlot({ src, className = '', overlay = 'dark', label, children }: { src: string; className?: string; overlay?: 'dark' | 'royal' | 'none'; label?: string; children?: ReactNode }) {
  const overlays = {
    dark: 'linear-gradient(100deg, rgba(16,24,32,0.94) 0%, rgba(16,24,32,0.78) 45%, rgba(16,24,32,0.35) 100%)',
    royal: 'linear-gradient(160deg, rgba(20,81,156,0.25) 0%, rgba(16,24,32,0.55) 100%)',
    none: 'linear-gradient(transparent, transparent)',
  };
  return (
    <div
      role={label ? 'img' : undefined}
      aria-label={label}
      className={cx('relative overflow-hidden bg-charcoal bg-cover bg-center', className)}
      style={{
        backgroundImage: `${overlays[overlay]}, url(${src}), radial-gradient(120% 90% at 85% 15%, rgba(107,159,197,0.55) 0%, rgba(20,81,156,0.55) 35%, rgba(16,24,32,1) 75%)`,
      }}
    >
      <div className="speed-lines pointer-events-none absolute inset-0" aria-hidden="true" />
      {children}
    </div>
  );
}

export function Section({ children, className = '', tone = 'white', id }: { children: ReactNode; className?: string; tone?: 'white' | 'mist' | 'dark' | 'royal'; id?: string }) {
  const tones = { white: 'bg-white', mist: 'bg-mist', dark: 'bg-charcoal text-white', royal: 'bg-royal text-white' };
  return (
    <section id={id} className={cx('relative py-20 sm:py-24', tones[tone], className)}>
      <div className="container-x relative">{children}</div>
    </section>
  );
}

export function SectionHeading({ eyebrow, title, intro, align = 'left', dark = false }: { eyebrow?: string; title: ReactNode; intro?: ReactNode; align?: 'left' | 'center'; dark?: boolean }) {
  return (
    <div className={cx('mb-12 max-w-3xl', align === 'center' && 'mx-auto text-center')}>
      {eyebrow && <p className={cx('eyebrow mb-3', dark ? 'text-sky' : 'text-royal')}>{eyebrow}</p>}
      <h2 className="text-balance text-4xl uppercase leading-[0.95] sm:text-5xl">{title}</h2>
      {intro && <p className={cx('mt-5 text-lg leading-relaxed', dark ? 'text-white/70' : 'text-muted')}>{intro}</p>}
    </div>
  );
}

export function PageHero({ eyebrow, title, intro, image, children }: { eyebrow: string; title: ReactNode; intro: ReactNode; image: string; children?: ReactNode }) {
  return (
    <ImageSlot src={image} className="text-white">
      <div className="container-x relative py-20 sm:py-28">
        <p className="eyebrow mb-4">{eyebrow}</p>
        <h1 className="max-w-4xl text-balance text-5xl uppercase leading-[0.9] sm:text-7xl">{title}</h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/75">{intro}</p>
        {children && <div className="mt-9 flex flex-wrap gap-3">{children}</div>}
      </div>
      <div className="h-1.5 w-full bg-gradient-to-r from-royal via-sky to-royal" aria-hidden="true" />
    </ImageSlot>
  );
}

export function DraftBadge({ children = 'Draft pricing – subject to confirmation', className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full border border-warn/30 bg-[#fff6e8] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-warn', className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-hidden="true" />
      {children}
    </span>
  );
}

export function PendingBadge({ children = 'Availability being confirmed', className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full border border-sky/50 bg-sky-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-royal-800', className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-sky" aria-hidden="true" />
      {children}
    </span>
  );
}

export function priceText(s: Pick<Service, 'price_cents' | 'price_status' | 'price_unit'>) {
  if (s.price_status === 'on_enquiry' || s.price_cents == null) return null;
  const d = s.price_cents / 100;
  return Number.isInteger(d) ? `$${d}` : `$${d.toFixed(2)}`;
}

export function ServiceStatus({ s }: { s: Service }) {
  return (
    <div className="flex flex-wrap gap-2">
      {s.price_status === 'draft' && <DraftBadge />}
      {s.availability === 'pending_confirmation' && <PendingBadge />}
    </div>
  );
}

export function CtaBand({ title, text, primary, secondary }: { title: ReactNode; text: ReactNode; primary: { href: string; label: string }; secondary?: { href: string; label: string } }) {
  return (
    <section className="relative overflow-hidden bg-royal text-white">
      <div className="speed-lines absolute inset-0 opacity-70" aria-hidden="true" />
      <div className="container-x relative flex flex-col items-start justify-between gap-8 py-16 md:flex-row md:items-center">
        <div className="max-w-2xl">
          <h2 className="text-4xl uppercase leading-none sm:text-5xl">{title}</h2>
          <p className="mt-4 text-lg text-white/80">{text}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href={primary.href} className="btn-light">{primary.label}</Link>
          {secondary && <Link href={secondary.href} className="btn-outline">{secondary.label}</Link>}
        </div>
      </div>
    </section>
  );
}

export function NumberedCard({ n, title, text, href, cta = 'Learn more' }: { n: string; title: string; text: string; href: string; cta?: string }) {
  return (
    <Link href={href} className="group card relative flex h-full flex-col overflow-hidden p-7 transition duration-300 hover:-translate-y-1 hover:border-royal hover:shadow-[0_18px_40px_-20px_rgba(20,81,156,0.45)]">
      <span className="font-display text-5xl font-extrabold text-sky/40 transition group-hover:text-royal">{n}</span>
      <h3 className="mt-4 text-2xl uppercase leading-tight">{title}</h3>
      <p className="mt-3 flex-1 text-[15px] leading-relaxed text-muted">{text}</p>
      <span className="mt-6 font-display text-sm font-semibold uppercase tracking-wider text-royal">{cta} →</span>
      <span className="absolute inset-x-0 bottom-0 h-1 origin-left scale-x-0 bg-royal transition duration-300 group-hover:scale-x-100" aria-hidden="true" />
    </Link>
  );
}

export function Check({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <li className="flex gap-3">
      <svg className={cx('mt-0.5 h-5 w-5 shrink-0', dark ? 'text-sky' : 'text-royal')} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd" />
      </svg>
      <span>{children}</span>
    </li>
  );
}

/* ---------------------------------------------------------------- specials */

const dollars = (cents: number) => {
  const d = cents / 100;
  return Number.isInteger(d) ? `$${d}` : `$${d.toFixed(2)}`;
};

/** A service is "on special" when it has an approved offer price below a genuine standard price. */
export function isOnSpecial(s: Service): boolean {
  return s.price_status === 'approved' && s.price_cents != null && s.standard_price_cents != null && s.standard_price_cents > s.price_cents;
}

/** Services management has chosen to promote across the site. */
export function featuredServices(services: Service[]): Service[] {
  return services.filter((s) => s.is_featured && s.is_public && s.availability !== 'unavailable');
}

/** Link that opens the booking-request form with this service already chosen. */
export function enquireHref(s: Pick<Service, 'name'>): string {
  return `/contact?form=booking&service=${encodeURIComponent(s.name)}`;
}

export function SpecialBadge({ children = 'Special', dark = false, className = '' }: { children?: ReactNode; dark?: boolean; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-display text-xs font-bold uppercase tracking-[0.14em]', dark ? 'bg-sky text-charcoal' : 'bg-royal text-white', className)}>
      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
      </svg>
      {children}
    </span>
  );
}

/** Offer price with the standard price crossed out, the saving and the conditions. */
export function OfferPrice({ s, dark = false, size = 'lg' }: { s: Service; dark?: boolean; size?: 'md' | 'lg' }) {
  const price = priceText(s);
  if (!price) return null;
  const special = isOnSpecial(s);
  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={cx('font-display font-extrabold leading-none', size === 'lg' ? 'text-5xl sm:text-6xl' : 'text-3xl')}>{price}</span>
        {special && (
          <span className={cx('font-display font-semibold', size === 'lg' ? 'text-2xl' : 'text-lg', dark ? 'text-white/55' : 'text-muted')}>
            <span className="sr-only">Standard price </span>
            <s>{dollars(s.standard_price_cents!)}</s>
          </span>
        )}
        {special && (
          <span className={cx('rounded-md px-2 py-0.5 font-display text-sm font-bold uppercase tracking-wider', dark ? 'bg-sky/20 text-sky' : 'bg-sky-100 text-royal')}>
            Save {dollars(s.standard_price_cents! - s.price_cents!)}
          </span>
        )}
      </p>
      {s.price_unit && <p className={cx('mt-2 text-sm', dark ? 'text-white/65' : 'text-muted')}>{s.price_unit}</p>}
      {s.offer_terms && <p className={cx('mt-1 text-sm font-medium', dark ? 'text-white/80' : 'text-charcoal/80')}>{s.offer_terms}</p>}
    </div>
  );
}

/** The Stripe payment link for a service, when it can be paid for online. */
export function payUrl(s: Pick<Service, 'payment_link_url' | 'price_status' | 'availability'>): string | null {
  return s.payment_link_url && s.price_status === 'approved' && s.availability === 'available' ? s.payment_link_url : null;
}

/** "Pay online" – opens the service's Stripe checkout in a new tab. */
export function PayLink({ s, className = 'btn-outline-dark', children = 'Pay online' }: { s: Service; className?: string; children?: ReactNode }) {
  const url = payUrl(s);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={className} aria-label={`Pay online for ${s.name} (opens Stripe secure checkout)`}>
      {children}
    </a>
  );
}

/** Large promotional block for a featured service. */
export function FeaturedOffer({ s, id, headingLevel = 'h2', showMore = true }: { s: Service; id?: string; headingLevel?: 'h2' | 'h3'; showMore?: boolean }) {
  const H = headingLevel;
  return (
    <section id={id} className="relative scroll-mt-28 overflow-hidden bg-charcoal text-white" aria-label={`${s.offer_label || 'Special'}: ${s.name}`}>
      <div className="speed-lines absolute inset-0" aria-hidden="true" />
      <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-royal/40 blur-3xl" aria-hidden="true" />
      <div className="container-x relative grid gap-10 py-16 sm:py-20 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-7">
          <SpecialBadge dark>{s.offer_label || 'Special'}</SpecialBadge>
          <H className="mt-5 text-balance text-4xl uppercase leading-[0.92] sm:text-6xl">{s.name}</H>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/75">{s.summary}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white p-7 text-charcoal shadow-2xl sm:p-9 lg:col-span-5">
          <OfferPrice s={s} />
          <div className="mt-7 flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
            <Link href={enquireHref(s)} className="btn-primary flex-1">Claim your spot</Link>
            <PayLink s={s} className="btn-outline-dark flex-1">Pay now</PayLink>
            {showMore && <Link href="/sports-performance#special" className="btn-outline-dark flex-1">Find out more</Link>}
          </div>
        </div>
      </div>
      <div className="h-1.5 w-full bg-gradient-to-r from-royal via-sky to-royal" aria-hidden="true" />
    </section>
  );
}

/** What the site-wide bar says about a special (used inside AnnouncementBar). */
export function SpecialBannerContent({ s }: { s: Service }) {
  const special = isOnSpecial(s);
  return (
    <>
      <span className="font-display font-bold uppercase tracking-[0.16em] text-sky-100">{s.offer_label || 'Special'}</span>
      <span className="hidden h-1 w-1 rotate-45 bg-sky sm:inline-block" aria-hidden="true" />
      <span className="font-semibold">{s.name}</span>
      {priceText(s) && (
        <span>
          {priceText(s)}
          {special && <> <s className="text-white/60">{dollars(s.standard_price_cents!)}</s></>}
        </span>
      )}
      <span className="font-display font-semibold uppercase tracking-wider underline-offset-4 group-hover:underline">Find out more →</span>
    </>
  );
}

/** Thin site-wide announcement shown above the header on every page. */
export function SpecialBanner({ s }: { s: Service }) {
  const special = isOnSpecial(s);
  return (
    <Link href="/sports-performance#special" className="group block bg-royal text-white">
      <span className="container-x flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-2.5 text-center text-sm">
        <span className="font-display font-bold uppercase tracking-[0.16em] text-sky-100">{s.offer_label || 'Special'}</span>
        <span className="hidden h-1 w-1 rotate-45 bg-sky sm:inline-block" aria-hidden="true" />
        <span className="font-semibold">{s.name}</span>
        {priceText(s) && (
          <span>
            {priceText(s)}
            {special && <> <s className="text-white/60">{dollars(s.standard_price_cents!)}</s></>}
          </span>
        )}
        <span className="font-display font-semibold uppercase tracking-wider underline-offset-4 group-hover:underline">Find out more →</span>
      </span>
    </Link>
  );
}
