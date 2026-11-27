import type { Metadata } from 'next';
import { AcademyView } from '@/components/site/views/ServicePages';
import { getCachedPublicSiteData } from '@/lib/kb/cached';

export const revalidate = 60;
export const metadata: Metadata = {
  title: 'Football Performance Academy',
  description: 'ASPARC Football Performance Academy – speed, strength, agility and athletic development for footballers aged 8–16 at ASPARC in Bundoora, Melbourne. Now enrolling for Term 1 2027.',
};

export default async function Page() {
  return <AcademyView site={await getCachedPublicSiteData()} />;
}
