import type { Metadata } from 'next';
import { TestingView } from '@/components/site/views/ServicePages';
import { getPublicSiteData } from '@/lib/kb/service';

export const revalidate = 60;
export const metadata: Metadata = { title: 'Performance Testing', description: 'Athletic profiling to identify strengths, gaps and training priorities.' };

export default async function Page() {
  return <TestingView site={await getPublicSiteData()} />;
}
