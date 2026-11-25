import { CLINIC_PAGES, DIVISIONS } from '@/lib/site/divisions';

export interface NavItem {
  href: string;
  label: string;
  children?: readonly { href: string; label: string }[];
}

/** Main menu: ASPARC's four areas of business, then About. */
export const NAV: NavItem[] = [
  ...DIVISIONS.map((d) => ({ href: d.href, label: d.nav, ...(d.key === 'clinic' ? { children: [{ href: '/clinic', label: 'Clinic overview' }, ...CLINIC_PAGES] } : {}) })),
  { href: '/about', label: 'About' },
];

export const LEGAL = [
  { href: '/privacy-policy', label: 'Privacy Policy' },
  { href: '/terms-and-conditions', label: 'Terms & Conditions' },
] as const;
