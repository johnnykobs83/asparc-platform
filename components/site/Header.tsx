'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Logo } from './Logo';
import { NAV, type NavItem } from './nav';

const isActive = (n: NavItem, path: string) => path.startsWith(n.href) || !!n.children?.some((c) => path.startsWith(c.href));

export function Header({ pathname: initialPath = '', onlineBooking = false }: { pathname?: string; onlineBooking?: boolean }) {
  const cta = onlineBooking ? { href: '/book', label: 'Book online' } : { href: '/contact', label: 'Enquire now' };
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [path, setPath] = useState(initialPath);

  useEffect(() => {
    setPath(window.location.pathname);
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
  }, [open]);

  return (
    <header className={`sticky top-0 z-40 border-b bg-white transition-shadow duration-300 ${scrolled || open ? 'border-line shadow-[0_8px_24px_-12px_rgba(16,24,32,0.25)]' : 'border-transparent'}`}>
      <div className="container-x flex h-[84px] items-center justify-between gap-3 sm:gap-6">
        <Link href="/" aria-label="ASPARC home" className="shrink-0">
          <Logo className="h-[64px]" />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-0.5 xl:flex">
          {NAV.map((n) => {
            const active = isActive(n, path);
            const link = `whitespace-nowrap rounded px-2.5 py-2 font-display text-[15px] font-semibold uppercase tracking-wider transition ${active ? 'text-royal' : 'text-charcoal/75 hover:text-royal'}`;
            if (!n.children) {
              return (
                <Link key={n.href} href={n.href} className={link} aria-current={path.startsWith(n.href) ? 'page' : undefined}>
                  {n.label}
                </Link>
              );
            }
            // Clinic: a hover / keyboard-focus menu of the clinic's pages.
            return (
              <div key={n.href} className="group relative">
                <Link href={n.href} className={`${link} inline-flex items-center gap-1`} aria-current={path.startsWith(n.href) ? 'page' : undefined} aria-haspopup="true">
                  {n.label}
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="transition group-hover:rotate-180 group-focus-within:rotate-180">
                    <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </Link>
                <div className="invisible absolute left-0 top-full z-50 pt-2 opacity-0 transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                  <ul className="w-72 overflow-hidden rounded-lg border border-line bg-white py-2 shadow-[0_18px_40px_-20px_rgba(16,24,32,0.45)]">
                    {n.children.map((c) => (
                      <li key={c.href}>
                        <Link href={c.href} className={`block px-4 py-2.5 text-[15px] transition hover:bg-mist hover:text-royal ${path === c.href ? 'font-semibold text-royal' : 'text-charcoal'}`}>
                          {c.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          {/* Always in the top bar – on phones too – so booking is one tap from any page. */}
          <Link href={cta.href} className="btn-primary whitespace-nowrap !px-3 !py-2 !text-[13px] sm:!px-4 sm:!py-2.5 sm:!text-sm">
            {cta.label}
          </Link>
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-charcoal xl:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h10" />}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="h-[calc(100dvh-84px)] overflow-y-auto border-t border-line bg-white xl:hidden">
          <div className="container-x flex flex-col py-6">
            {[{ href: '/', label: 'Home' } as NavItem, ...NAV, { href: '/contact', label: 'Contact' }].map((n) => (
              <div key={n.href} className="border-b border-line py-4">
                <Link href={n.href} onClick={() => setOpen(false)} className="font-display text-2xl font-bold uppercase tracking-wide text-charcoal hover:text-royal">
                  {n.label}
                </Link>
                {n.children && (
                  <ul className="mt-3 space-y-2 border-l-2 border-sky pl-4">
                    {n.children.filter((c) => c.href !== n.href).map((c) => (
                      <li key={c.href}>
                        <Link href={c.href} onClick={() => setOpen(false)} className="text-base text-charcoal/80 hover:text-royal">
                          {c.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            <Link href={cta.href} onClick={() => setOpen(false)} className="btn-primary mt-8">
              {cta.label}
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
