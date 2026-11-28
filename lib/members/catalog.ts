/**
 * What the Members area holds. Plain data (no fs), so the dashboard and the
 * site can both import it. The files themselves live in /members-content,
 * outside /public, and are only served after a sign-in check.
 */
export type AccessKey = 'access_hub' | 'access_warmup' | 'access_downloads';

export const MEMBER_PAGES = [
  {
    slug: 'training-health',
    title: 'Training & Health Hub',
    file: 'training-health.html',
    access: 'access_hub' as AccessKey,
    blurb: '12 topics on training, recovery, nutrition and hydration, with protein and fluid calculators.',
  },
  {
    slug: 'warm-up',
    title: 'The ASPARC Warm-Up',
    file: 'warm-up.html',
    access: 'access_warmup' as AccessKey,
    blurb: 'The Perform+ based warm-up: a phase planner by session and age group, and an on-pitch run-through.',
  },
] as const;

export type MemberPageSlug = (typeof MEMBER_PAGES)[number]['slug'];

export const TOPICS = [
  { n: 1, slug: 'warm-up', title: 'The Warm-Up', group: 'Training + Sports Science' },
  { n: 2, slug: 'periodisation', title: 'Periodisation', group: 'Training + Sports Science' },
  { n: 3, slug: 'strength-training', title: 'Strength Training', group: 'Training + Sports Science' },
  { n: 4, slug: 'recovery', title: 'Recovery', group: 'Training + Sports Science' },
  { n: 5, slug: 'extreme-environments', title: 'Extreme Environments', group: 'Training + Sports Science' },
  { n: 6, slug: 'exercise-testing', title: 'Exercise Testing', group: 'Training + Sports Science' },
  { n: 7, slug: 'nutrition-foundations', title: 'Nutrition Foundations', group: 'Health + Wellbeing' },
  { n: 8, slug: 'fuelling-enough', title: 'Fuelling Enough', group: 'Health + Wellbeing' },
  { n: 9, slug: 'protein', title: 'Protein', group: 'Health + Wellbeing' },
  { n: 10, slug: 'recovery-nutrition', title: 'Recovery Nutrition', group: 'Health + Wellbeing' },
  { n: 11, slug: 'hydration', title: 'Hydration', group: 'Health + Wellbeing' },
  { n: 12, slug: 'recipes', title: 'Recipes', group: 'Health + Wellbeing' },
] as const;

export interface DownloadFile {
  file: string;
  kind: 'poster' | 'social' | 'pack';
  label: string;
  topic: number | null;
  type: 'application/pdf' | 'image/png';
}

const pad = (n: number) => String(n).padStart(2, '0');

export const PACK_FILE = 'ASPARC-Training-Health-Poster-Pack-A3.pdf';

export const DOWNLOADS: DownloadFile[] = [
  { file: PACK_FILE, kind: 'pack', label: 'All 12 posters (A3 PDF)', topic: null, type: 'application/pdf' },
  ...TOPICS.flatMap((t): DownloadFile[] => [
    { file: `ASPARC-${pad(t.n)}-${t.slug}-A3.pdf`, kind: 'poster', label: `${t.title} poster (A3 PDF)`, topic: t.n, type: 'application/pdf' },
    { file: `ASPARC-${pad(t.n)}-${t.slug}-social.png`, kind: 'social', label: `${t.title} social image (1080 × 1350)`, topic: t.n, type: 'image/png' },
  ]),
];

/** Only names on this list can ever be served. */
export const findDownload = (name: string): DownloadFile | null => DOWNLOADS.find((d) => d.file === name) ?? null;

export const downloadHref = (d: Pick<DownloadFile, 'file'>, inline = false) => `/members/download/${encodeURIComponent(d.file)}${inline ? '?view=1' : ''}`;
