import { HomeView } from '@/components/site/views/HomeView';
import { getCachedPublicSiteData } from '@/lib/kb/cached';

export const revalidate = 60;

export default async function HomePage() {
  return <HomeView site={await getCachedPublicSiteData()} />;
}
