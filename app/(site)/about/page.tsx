import type { Metadata } from 'next';
import { AboutView } from '@/components/site/views/ServicePages';
import { getCachedPublicSiteData } from '@/lib/kb/cached';

export const revalidate = 60;
export const metadata: Metadata = { title: 'About ASPARC', description: 'About ASPARC – Australian Sports Performance and Rehabilitation Centre – and founder John Kobiela.' };

export default async function Page() {
  return <AboutView site={await getCachedPublicSiteData()} />;
}
