import type { Metadata } from 'next';
import { ConsultingView } from '@/components/site/views/DivisionPages';

export const metadata: Metadata = { title: 'Consulting', description: 'Program design and performance consulting for clubs, coaches and individual athletes – from ASPARC.' };

export default function Page() {
  return <ConsultingView />;
}
