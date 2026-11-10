import type { Metadata } from 'next';
import { PrivacyView } from '@/components/site/views/StaticPages';
import { getPublicSiteData } from '@/lib/kb/service';

export const revalidate = 60;
export const metadata: Metadata = { title: 'Privacy Policy', description: 'How ASPARC handles your personal information.' };

export default async function Page() {
  return <PrivacyView site={await getPublicSiteData()} />;
}
