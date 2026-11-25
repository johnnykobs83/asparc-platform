import type { Metadata } from 'next';
import { PreVisitForm } from '@/components/site/PreVisitForm';
import { Section } from '@/components/site/ui';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Pre-visit form',
  description: 'Your ASPARC pre-visit form.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

/** Opened from the personal link in the client's email. The token is checked by the API. */
export default async function PreVisitPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <Section tone="mist" className="!py-12 sm:!py-16">
      <div className="mx-auto max-w-3xl">
        <p className="eyebrow mb-3 text-royal">Before your visit</p>
        <h1 className="text-balance text-4xl uppercase leading-[0.95] sm:text-5xl">Pre-visit form</h1>
        <PreVisitForm token={token} />
      </div>
    </Section>
  );
}
