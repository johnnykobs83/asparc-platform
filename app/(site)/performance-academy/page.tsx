import type { Metadata } from 'next';
import { AcademyView } from '@/components/site/views/ServicePages';
import { getPublicSiteData } from '@/lib/kb/service';

export const revalidate = 60;
export const metadata: Metadata = { title: 'Performance Academy', description: 'A 10-week athletic development program for junior athletes aged 8–18 in Melbourne.' };

export default async function Page() {
  return <AcademyView site={await getPublicSiteData()} />;
}
