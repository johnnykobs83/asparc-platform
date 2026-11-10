import { HomeView } from '@/components/site/views/HomeView';
import { getPublicSiteData } from '@/lib/kb/service';

export const revalidate = 60;

export default async function HomePage() {
  return <HomeView site={await getPublicSiteData()} />;
}
