/**
 * ASPARC Football Performance Academy – groups, packages and the default weekly
 * timetable. Shared by the website, the dashboard and the server, so it must stay
 * free of server-only imports. Prices are NOT here: they come from Pricing &
 * Services (each package is a service), so they can be changed without code.
 */

export const ACADEMY = {
  name: 'ASPARC Football Performance Academy',
  term: 'Term 1 2027',
  venue: 'Avenger Park',
  capacity: 12,
  /** Show the launch announcement across the website. */
  announce: true,
} as const;

export const ACADEMY_GROUPS = [
  {
    key: 'foundation',
    name: 'Foundation Movers',
    ages: '8–11',
    minAge: 8,
    maxAge: 11,
    colour: '#0E8C7F',
    text: 'Build movement confidence and a lifelong love of physical activity.',
    focus: ['Running mechanics', 'Balance and coordination', 'Jumping and landing', 'Sprint technique and agility', 'Core control and confidence', 'Fun, active competition'],
    image: '/images/academy-8-10.jpg',
    position: 'object-[50%_30%]',
  },
  {
    key: 'athletic',
    name: 'Athletic Development',
    ages: '11–13',
    minAge: 11,
    maxAge: 13,
    colour: '#14519C',
    text: 'Build strong movement and strength foundations through the growth years.',
    focus: ['Sprint technique', 'Change of direction', 'Controlled deceleration', 'Basic strength and mobility', 'Landing control and core strength', 'Injury prevention foundations'],
    image: '/images/academy-11-13.jpg',
    position: 'object-[70%_45%]',
  },
  {
    key: 'performance',
    name: 'Performance Development',
    ages: '14–16',
    minAge: 14,
    maxAge: 16,
    colour: '#D9822B',
    text: 'Build the strength, speed and power required for higher-level football.',
    focus: ['Acceleration and sprint speed', 'Strength and relative strength', 'Explosive power', 'Change of direction', 'Football conditioning', 'Resilience and injury prevention'],
    image: '/images/academy-14-16.jpg',
    position: 'object-[50%_40%]',
  },
] as const;

export type AcademyGroupKey = (typeof ACADEMY_GROUPS)[number]['key'];
export const groupOf = (key: string) => ACADEMY_GROUPS.find((g) => g.key === key);

/** The groups an athlete can join at a given age (11-year-olds can choose either of two). */
export const groupsForAge = (age: number | null) => (age == null ? [] : ACADEMY_GROUPS.filter((g) => age >= g.minAge && age <= g.maxAge));

export const ACADEMY_PACKAGES = [
  { key: 'term_1x', slug: 'performance-academy', label: '1 session a week', detail: '10-week term', sessions: 1 },
  { key: 'term_2x', slug: 'academy-term-2x', label: '2 sessions a week', detail: '10-week term', sessions: 2 },
  { key: 'annual', slug: 'academy-annual', label: 'Annual', detail: '1 session a week, all four terms', sessions: 1 },
  { key: 'casual', slug: 'academy-casual', label: 'Casual', detail: 'One session', sessions: 1 },
] as const;

export type AcademyPackageKey = (typeof ACADEMY_PACKAGES)[number]['key'];
export const packageOf = (key: string) => ACADEMY_PACKAGES.find((p) => p.key === key);

/** Weekday 1 = Monday … 7 = Sunday; minutes from midnight, Melbourne time. */
export const DEFAULT_TIMETABLE: { weekday: number; start: number; end: number; group: AcademyGroupKey }[] = [
  // Owner's timetable, updated 26 Nov 2026 (15 sessions a week).
  { weekday: 1, start: 990, end: 1040, group: 'foundation' },
  { weekday: 2, start: 990, end: 1040, group: 'athletic' },
  { weekday: 2, start: 1040, end: 1090, group: 'athletic' },
  { weekday: 2, start: 1090, end: 1140, group: 'performance' },
  { weekday: 3, start: 990, end: 1040, group: 'performance' },
  { weekday: 3, start: 1040, end: 1090, group: 'athletic' },
  { weekday: 3, start: 1090, end: 1140, group: 'performance' },
  { weekday: 4, start: 990, end: 1040, group: 'foundation' },
  { weekday: 4, start: 1040, end: 1090, group: 'foundation' },
  { weekday: 4, start: 1090, end: 1140, group: 'foundation' },
  { weekday: 5, start: 990, end: 1040, group: 'athletic' },
  { weekday: 5, start: 1040, end: 1090, group: 'performance' },
  { weekday: 6, start: 490, end: 540, group: 'foundation' },
  { weekday: 6, start: 540, end: 590, group: 'athletic' },
  { weekday: 6, start: 590, end: 640, group: 'performance' },
];

export const WEEKDAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export const WEEKDAYS_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export const timeText = (m: number) => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')}${m < 720 ? 'am' : 'pm'}`;
export const slotText = (s: { weekday: number; start_minutes: number; end_minutes: number }) => `${WEEKDAYS[s.weekday]} ${timeText(s.start_minutes)}–${timeText(s.end_minutes)}`;

/** Age in whole years on a given day (YYYY-MM-DD). */
export function ageOn(dob: string, on: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const [y, m, d] = dob.split('-').map(Number);
  const [ty, tm, td] = on.split('-').map(Number);
  let a = ty - y;
  if (tm < m || (tm === m && td < d)) a--;
  return a;
}
