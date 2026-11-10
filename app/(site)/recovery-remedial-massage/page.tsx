import type { Metadata } from 'next';
import { RecoveryView } from '@/components/site/views/ServicePages';
import { getCachedPublicSiteData } from '@/lib/kb/cached';

export const revalidate = 60;
export const metadata: Metadata = { title: 'Recovery & Remedial Massage', description: 'Remedial massage to support recovery and performance.' };

export default async function Page() {
  return <RecoveryView site={await getCachedPublicSiteData()} />;
}
