import type { Metadata } from 'next';
import { RecoveryView } from '@/components/site/views/ServicePages';
import { getPublicSiteData } from '@/lib/kb/service';

export const revalidate = 60;
export const metadata: Metadata = { title: 'Recovery & Remedial Massage', description: 'Remedial massage to support recovery and performance.' };

export default async function Page() {
  return <RecoveryView site={await getPublicSiteData()} />;
}
