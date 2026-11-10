import type { Metadata } from 'next';
import { AboutView } from '@/components/site/views/ServicePages';
import { getPublicSiteData } from '@/lib/kb/service';

export const revalidate = 60;
export const metadata: Metadata = { title: 'About ASPARC', description: 'About ASPARC – Australian Sports Performance and Rehabilitation Centre – and founder John Kobiela.' };

export default async function Page() {
  return <AboutView site={await getPublicSiteData()} />;
}
