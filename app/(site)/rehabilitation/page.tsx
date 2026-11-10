import type { Metadata } from 'next';
import { RehabilitationView } from '@/components/site/views/ServicePages';
import { getCachedPublicSiteData } from '@/lib/kb/cached';

export const revalidate = 60;
export const metadata: Metadata = { title: 'Rehabilitation', description: 'Exercise-based return-to-performance training, delivered alongside your treating practitioner.' };

export default async function Page() {
  return <RehabilitationView site={await getCachedPublicSiteData()} />;
}
