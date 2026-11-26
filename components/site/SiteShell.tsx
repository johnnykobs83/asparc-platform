import type { ReactNode } from 'react';
import type { PublicSiteData } from '@/lib/kb/service';
import { ChatWidget } from '../chat/ChatWidget';
import { Footer } from './Footer';
import { Header } from './Header';
import { ACADEMY } from '@/lib/academy/config';
import { AnnouncementBar, type Deal } from './AnnouncementBar';
import { dealFor, featuredServices, priceText } from './ui';

export function SiteShell({ site, children }: { site: PublicSiteData; children: ReactNode }) {
  const services = site.services.filter((s) => s.availability !== 'unavailable').map((s) => ({ name: s.name, category: s.category }));
  const academy = site.services.find((s) => s.slug === 'performance-academy' && s.is_public && s.availability !== 'unavailable');
  const featured = featuredServices(site.services).find((s) => s.category !== 'academy');
  const deals: Deal[] = [
    ...(ACADEMY.announce
      ? [
          academy && priceText(academy)
            ? dealFor(academy, { key: 'academy', href: '/performance-academy#enrol', tag: 'Now enrolling', title: 'Football Performance Academy', detail: `Ages 8–16 · ${ACADEMY.term}`, cta: 'Enrol now' })
            : { key: 'academy', href: '/performance-academy#enrol', tag: 'Now enrolling', title: 'Football Performance Academy', detail: `Ages 8–16 · ${ACADEMY.term}`, cta: 'Enrol now' },
        ]
      : []),
    ...(featured ? [dealFor(featured, { key: 'special', href: '/sports-performance#special', cta: 'Claim your spot' })] : []),
  ];
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded focus:bg-white focus:px-4 focus:py-2">
        Skip to content
      </a>
      <AnnouncementBar items={deals} />
      <Header onlineBooking={Boolean(site.onlineBooking)} />
      <main id="main">{children}</main>
      <Footer site={site} />
      <ChatWidget services={services} />
    </>
  );
}
