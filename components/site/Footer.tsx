import Link from 'next/link';
import { BRAND } from '@/lib/brand';
import type { PublicSiteData } from '@/lib/kb/service';
import { Logo } from './Logo';
import { LEGAL, NAV } from './nav';

export function Footer({ site }: { site: PublicSiteData }) {
  const { contact } = site;
  const socials = [
    { href: contact.instagram_url, label: 'Instagram' },
    { href: contact.facebook_url, label: 'Facebook' },
    { href: contact.linkedin_url, label: 'LinkedIn' },
  ].filter((s) => s.href);

  return (
    <footer className="relative overflow-hidden bg-charcoal text-white">
      <div className="speed-lines absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="container-x relative grid gap-12 py-16 md:grid-cols-12">
        <div className="md:col-span-4">
          <Logo onDark className="h-24" />
          <p className="mt-6 font-display text-3xl font-bold uppercase leading-none tracking-tight">
            Performance <span className="text-sky">starts here.</span>
          </p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/60">{BRAND.fullName}. Sports performance, athlete development, rehabilitation and recovery in {BRAND.location}.</p>
        </div>
        <div className="md:col-span-3">
          <h2 className="eyebrow mb-4">Services</h2>
          <ul className="space-y-2.5 text-sm text-white/75">
            {NAV.slice(0, 5).map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="hover:text-white">{n.label}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="md:col-span-2">
          <h2 className="eyebrow mb-4">ASPARC</h2>
          <ul className="space-y-2.5 text-sm text-white/75">
            <li><Link href="/about" className="hover:text-white">About</Link></li>
            <li><Link href="/contact" className="hover:text-white">Contact</Link></li>
            <li><Link href="/performance-academy#register" className="hover:text-white">Academy registration</Link></li>
            <li><Link href="/contact?form=club" className="hover:text-white">Club partnerships</Link></li>
          </ul>
        </div>
        <div className="md:col-span-3">
          <h2 className="eyebrow mb-4">Get in touch</h2>
          <ul className="space-y-2.5 text-sm text-white/75">
            <li>{site.location.address || site.location.text.split('.')[0]}</li>
            {contact.phone && <li><a href={`tel:${contact.phone.replace(/\s/g, '')}`} className="hover:text-white">{contact.phone}</a></li>}
            {contact.email && <li><a href={`mailto:${contact.email}`} className="hover:text-white">{contact.email}</a></li>}
            <li><Link href="/contact" className="font-semibold text-sky hover:text-white">Send an enquiry →</Link></li>
          </ul>
          {socials.length > 0 && (
            <ul className="mt-6 flex gap-3" aria-label="Social media">
              {socials.map((s) => (
                <li key={s.label}>
                  <a href={s.href} target="_blank" rel="noopener noreferrer" className="inline-flex rounded border border-white/20 px-3 py-1.5 text-xs uppercase tracking-wider text-white/80 hover:border-sky hover:text-white">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="relative border-t border-white/10">
        <div className="container-x flex flex-col gap-3 py-6 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {BRAND.name} – {BRAND.fullName}</p>
          <ul className="flex gap-5">
            {LEGAL.map((l) => (
              <li key={l.href}><Link href={l.href} className="hover:text-white">{l.label}</Link></li>
            ))}
            <li><Link href="/admin" className="hover:text-white">Staff login</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
