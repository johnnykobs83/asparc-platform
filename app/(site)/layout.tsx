import { SiteShell } from '@/components/site/SiteShell';
import { getPublicSiteData } from '@/lib/kb/service';

export const revalidate = 60;

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const site = await getPublicSiteData();
  return <SiteShell site={site}>{children}</SiteShell>;
}
