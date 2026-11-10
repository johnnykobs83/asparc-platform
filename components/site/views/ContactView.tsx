'use client';

import { useEffect, useState } from 'react';
import { EnquiryForm, type FormKind, type ServiceOption } from '../EnquiryForm';

const TABS: { key: FormKind; label: string }[] = [
  { key: 'contact', label: 'General enquiry' },
  { key: 'booking', label: 'Booking request' },
  { key: 'academy', label: 'Academy' },
  { key: 'club', label: 'Club partnership' },
  { key: 'massage', label: 'Massage' },
];

export function ContactForms({ services, initial = 'contact' }: { services: ServiceOption[]; initial?: FormKind }) {
  const [tab, setTab] = useState<FormKind>(initial);
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get('form') as FormKind | null;
    if (f && TABS.some((t) => t.key === f)) setTab(f);
  }, []);
  return (
    <div>
      <div role="tablist" aria-label="Enquiry type" className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-4 py-2 font-display text-sm font-semibold uppercase tracking-wider transition ${tab === t.key ? 'bg-royal text-white' : 'bg-mist text-charcoal hover:bg-sky-100'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        <EnquiryForm key={tab} form={tab} services={services} leadType={tab === 'club' ? 'club_partnership' : undefined} />
      </div>
    </div>
  );
}
