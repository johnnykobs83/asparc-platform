import type { Metadata } from 'next';
import { ClinicView } from '@/components/site/views/DivisionPages';
import { getCachedPublicSiteData } from '@/lib/kb/cached';

export const revalidate = 60;
export const metadata: Metadata = { title: 'Sports Performance Centre', description: 'The ASPARC Sports Performance Centre – 1-on-1 training, rehabilitation, remedial massage and performance testing in Melbourne.' };

export default async function Page() {
  return <ClinicView site={await getCachedPublicSiteData()} />;
}
