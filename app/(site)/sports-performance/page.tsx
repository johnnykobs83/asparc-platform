import type { Metadata } from 'next';
import { SportsPerformanceView } from '@/components/site/views/ServicePages';
import { getCachedPublicSiteData } from '@/lib/kb/cached';

export const revalidate = 60;
export const metadata: Metadata = { title: 'Sports Performance', description: 'Strength and conditioning, speed, agility, power and football-specific physical preparation in Melbourne.' };

export default async function Page() {
  return <SportsPerformanceView site={await getCachedPublicSiteData()} />;
}
