import { SiteShell } from '@/components/site/SiteShell';
import { getCachedPublicSiteData } from '@/lib/kb/cached';

export const revalidate = 60;

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const site = await getCachedPublicSiteData();
  return <SiteShell site={site}>{children}</SiteShell>;
}
