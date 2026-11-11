import type { Metadata } from 'next';
import { BookingFlow } from '@/components/site/BookingFlow';
import { PageHero, Section } from '@/components/site/ui';
import { IMAGES } from '@/lib/brand';

export const metadata: Metadata = { title: 'Book Online', description: 'Book an appointment with an ASPARC practitioner online – choose a service, a time that suits you, and you are confirmed straight away.' };

export default function BookPage() {
  return (
    <>
      <PageHero eyebrow="Book online" title={<>Pick a time. <span className="text-sky">You&apos;re booked.</span></>} intro="Choose a service and a time that suits you. Your appointment is confirmed straight away – there is no need to wait for a call back." image={IMAGES.recovery} />
      <Section tone="mist">
        <div className="mx-auto max-w-3xl">
          <BookingFlow />
        </div>
      </Section>
    </>
  );
}
