import type { ReactNode } from 'react';
import type { PublicSiteData } from '@/lib/kb/service';
import { ChatWidget } from '../chat/ChatWidget';
import { Footer } from './Footer';
import { Header } from './Header';
import { ACADEMY } from '@/lib/academy/config';
import { AnnouncementBar } from './AnnouncementBar';
import { SpecialBannerContent, featuredServices } from './ui';

export function SiteShell({ site, children }: { site: PublicSiteData; children: ReactNode }) {
  const services = site.services.filter((s) => s.availability !== 'unavailable').map((s) => ({ name: s.name, category: s.category }));
  const featured = featuredServices(site.services)[0];
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded focus:bg-white focus:px-4 focus:py-2">
        Skip to content
      </a>
      <AnnouncementBar
        items={[
          ...(ACADEMY.announce
            ? [
                {
                  key: 'academy',
                  href: '/performance-academy',
                  content: (
                    <>
                      <span className="font-display font-bold uppercase tracking-[0.16em] text-sky-100">Now enrolling</span>
                      <span className="hidden h-1 w-1 rotate-45 bg-sky sm:inline-block" aria-hidden="true" />
                      <span className="font-semibold">ASPARC Football Performance Academy</span>
                      <span>Ages 8–16 · {ACADEMY.term}</span>
                      <span className="font-display font-semibold uppercase tracking-wider underline-offset-4 group-hover:underline">Enrol now →</span>
                    </>
                  ),
                },
              ]
            : []),
          ...(featured ? [{ key: 'special', href: '/sports-performance#special', content: <SpecialBannerContent s={featured} /> }] : []),
        ]}
      />
      <Header onlineBooking={Boolean(site.onlineBooking)} />
      <main id="main">{children}</main>
      <Footer site={site} />
      <ChatWidget services={services} />
    </>
  );
}
