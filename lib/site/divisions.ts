/**
 * ASPARC's four areas of business, in the order Johnny set (26 Nov 2026): Clinic, Academy,
 * Club Services, Consulting. The site's navigation,
 * home page and footer are organised around these, so a visitor can see straight away which
 * part of ASPARC is for them.
 */
export interface Division {
  key: 'club' | 'clinic' | 'academy' | 'consulting';
  name: string;
  /** Short label for the menu. */
  nav: string;
  href: string;
  who: string;
  summary: string;
  includes: string[];
}

export const DIVISIONS: Division[] = [
  {
    key: 'clinic',
    name: 'ASPARC Sports Performance Centre',
    nav: 'Clinic',
    href: '/clinic',
    who: 'For individual athletes',
    summary: 'Services at our centre – 1-on-1 training, rehabilitation, remedial massage and performance testing.',
    includes: ['1-on-1 training', 'Rehabilitation', 'Remedial massage', 'Performance testing'],
  },
  {
    key: 'academy',
    name: 'ASPARC Academy',
    nav: 'Academy',
    href: '/performance-academy',
    who: 'For young footballers',
    summary: 'Football-specific youth development – the ASPARC Football Performance Academy for players aged 8–16.',
    includes: ['Foundation Movers (8–11)', 'Athletic Development (11–13)', 'Performance Development (14–16)'],
  },
  {
    key: 'club',
    name: 'Club Performance Services',
    nav: 'Club Services',
    href: '/club-performance-services',
    who: 'For clubs & teams',
    summary: 'Performance services delivered for your club – strength & conditioning, sports science, physiotherapy and team testing.',
    includes: ['Strength & conditioning', 'Sports science', 'Physiotherapy', 'Team testing'],
  },
  {
    key: 'consulting',
    name: 'Consulting',
    nav: 'Consulting',
    href: '/consulting',
    who: 'For clubs, coaches & individuals',
    summary: 'Program design and performance consulting for clubs and individuals.',
    includes: ['Program design', 'Club consulting', 'Individual consulting'],
  },
];

/** The clinic's own pages, shown under "Clinic" in the menu and on the clinic page. */
export const CLINIC_PAGES = [
  { href: '/sports-performance', label: '1-on-1 Training & Sports Performance' },
  { href: '/rehabilitation', label: 'Rehabilitation' },
  { href: '/recovery-remedial-massage', label: 'Recovery & Massage' },
  { href: '/performance-testing', label: 'Performance Testing' },
] as const;

export const divisionFor = (path: string): Division | undefined =>
  DIVISIONS.find((d) => path.startsWith(d.href)) ?? (CLINIC_PAGES.some((p) => path.startsWith(p.href)) ? DIVISIONS.find((d) => d.key === 'clinic') : undefined);
