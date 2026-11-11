import { revalidateTag, unstable_cache } from 'next/cache';
import { onlineBookingEnabled } from '../bookings/service';
import { getPublicSiteData } from './service';

const SITE_DATA_TAG = 'site-data';

/**
 * Public site data for the website pages, cached for 60 seconds.
 * The Supabase adapter fetches with `cache: 'no-store'`, which on its own makes
 * every page render on demand; caching here lets pages be served from cache
 * (ISR) instead of querying the database on every visit.
 */
export const getCachedPublicSiteData = unstable_cache(
  async () => {
    const [site, onlineBooking] = await Promise.all([getPublicSiteData(), onlineBookingEnabled().catch(() => false)]);
    return { ...site, onlineBooking };
  },
  ['public-site-data'],
  {
    revalidate: 60,
    tags: [SITE_DATA_TAG],
  },
);

/** Call after an admin changes services or the knowledge base so the site updates immediately. */
export function refreshPublicSiteData(): void {
  try {
    revalidateTag(SITE_DATA_TAG);
  } catch {
    // Outside a Next.js request (tests, scripts) there is no cache to refresh.
  }
}
