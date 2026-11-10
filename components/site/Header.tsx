'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Logo } from './Logo';
import { NAV } from './nav';

export function Header({ pathname: initialPath = '' }: { pathname?: string }) {
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
      <div className="container-x flex h-[84px] items-center justify-between gap-6">
        <Link href="/" aria-label="ASPARC home" className="shrink-0">
          <Logo className="h-[64px]" />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-0.5 xl:flex">
          {NAV.map((n) => {
            const active = path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`whitespace-nowrap rounded px-2.5 py-2 font-display text-[15px] font-semibold uppercase tracking-wider transition ${active ? 'text-royal' : 'text-charcoal/75 hover:text-royal'}`}
                aria-current={active ? 'page' : undefined}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/contact" className="btn-primary hidden whitespace-nowrap !px-4 !py-2.5 !text-sm sm:inline-flex">
            Enquire now
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
            {[{ href: '/', label: 'Home' }, ...NAV, { href: '/contact', label: 'Contact' }].map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="border-b border-line py-4 font-display text-2xl font-bold uppercase tracking-wide text-charcoal hover:text-royal">
                {n.label}
              </Link>
            ))}
            <Link href="/contact" onClick={() => setOpen(false)} className="btn-primary mt-8">
              Enquire now
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
