import type { Metadata } from 'next';
import { TermsView } from '@/components/site/views/StaticPages';
import { getPublicSiteData } from '@/lib/kb/service';

export const revalidate = 60;
export const metadata: Metadata = { title: 'Terms & Conditions', description: 'Terms for using the ASPARC website and services.' };

export default async function Page() {
  return <TermsView site={await getPublicSiteData()} />;
}
