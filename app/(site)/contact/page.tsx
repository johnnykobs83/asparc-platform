import type { Metadata } from 'next';
import { ContactView } from '@/components/site/views/StaticPages';
import { getPublicSiteData } from '@/lib/kb/service';

export const revalidate = 60;
export const metadata: Metadata = { title: 'Contact Us', description: 'Enquire, request a booking, register for the Academy or discuss a club partnership.' };

export default async function Page() {
  return <ContactView site={await getPublicSiteData()} />;
}
