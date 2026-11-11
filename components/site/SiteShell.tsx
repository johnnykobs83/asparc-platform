import type { ReactNode } from 'react';
import type { PublicSiteData } from '@/lib/kb/service';
import { ChatWidget } from '../chat/ChatWidget';
import { Footer } from './Footer';
import { Header } from './Header';

export function SiteShell({ site, children }: { site: PublicSiteData; children: ReactNode }) {
  const services = site.services.filter((s) => s.availability !== 'unavailable').map((s) => ({ name: s.name, category: s.category }));
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded focus:bg-white focus:px-4 focus:py-2">
        Skip to content
      </a>
      <Header onlineBooking={Boolean(site.onlineBooking)} />
      <main id="main">{children}</main>
      <Footer site={site} />
      <ChatWidget services={services} />
    </>
  );
}
