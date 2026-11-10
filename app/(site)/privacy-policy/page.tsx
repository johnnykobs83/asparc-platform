import type { Metadata } from 'next';
import { PrivacyView } from '@/components/site/views/StaticPages';
import { getCachedPublicSiteData } from '@/lib/kb/cached';

export const revalidate = 60;
export const metadata: Metadata = { title: 'Privacy Policy', description: 'How ASPARC handles your personal information.' };

export default async function Page() {
  return <PrivacyView site={await getCachedPublicSiteData()} />;
}
