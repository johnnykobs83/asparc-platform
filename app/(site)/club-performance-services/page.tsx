import type { Metadata } from 'next';
import { ClubServicesView } from '@/components/site/views/DivisionPages';

export const metadata: Metadata = { title: 'Club Performance Services', description: 'Strength & conditioning, sports science, physiotherapy and team testing for sporting clubs – from ASPARC.' };

export default function Page() {
  return <ClubServicesView />;
}
