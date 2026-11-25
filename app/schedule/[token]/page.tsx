import type { Metadata } from 'next';
import Link from 'next/link';
import { PersonWeek } from '@/components/shared/PersonWeek';
import { dayName } from '@/components/shared/week-format';
import { Logo } from '@/components/site/Logo';
import { sharedWeek, staffForShare } from '@/lib/planner/share';
import { addDays, melbourneDate } from '@/lib/time/melbourne';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Weekly schedule',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

/** A read-only weekly schedule someone has shared from My Week. */
export default async function SharedSchedule({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ week?: string }> }) {
  const { token } = await params;
  const { week } = await searchParams;
  const staff = await staffForShare(token).catch(() => null);
  if (!staff) {
    return (
      <main className="mx-auto max-w-xl px-5 py-16 text-center">
        <Logo className="mx-auto h-16" />
        <h1 className="mt-6 text-3xl uppercase">Link not working</h1>
        <p className="mt-3 text-muted">This schedule link has expired or been replaced. Ask the person who shared it for a new one.</p>
      </main>
    );
  }
  const w = await sharedWeek(staff, week ?? null);
  const base = `/schedule/${token}`;
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Logo className="h-14" />
          <div>
            <p className="eyebrow text-royal">Weekly schedule</p>
            <h1 className="text-3xl uppercase leading-none sm:text-4xl">{w.name}</h1>
            {w.role_title && <p className="text-sm text-muted">{w.role_title}</p>}
          </div>
        </div>
        <nav aria-label="Week" className="flex items-center gap-2 text-sm">
          <Link className="rounded-md border border-line bg-white px-3 py-2 hover:border-royal" href={`${base}?week=${addDays(w.week_start, -7)}`} aria-label="Previous week">
            ←
          </Link>
          <span className="min-w-40 text-center font-medium">
            {dayName(w.days[0])} – {dayName(w.days[6])}
          </span>
          <Link className="rounded-md border border-line bg-white px-3 py-2 hover:border-royal" href={`${base}?week=${addDays(w.week_start, 7)}`} aria-label="Next week">
            →
          </Link>
          <Link className="ml-1 rounded-md px-2 py-2 text-royal underline" href={base}>
            This week
          </Link>
        </nav>
      </header>
      {w.published ? (
        <PersonWeek
          days={w.days}
          today={melbourneDate()}
          items={w.jobs.map((j) => ({ id: j.id, date: j.date, start: j.start, end: j.end, title: j.title, place: j.place, address: j.address, colour: j.colour, badge: j.covering ? { text: 'Covering', tone: 'amber' as const } : null }))}
        />
      ) : (
        <p className="rounded-xl border border-line bg-white p-6 text-muted">This week&apos;s schedule hasn&apos;t been finalised yet. Check back later.</p>
      )}
      <p className="mt-6 text-xs text-muted">Times are Melbourne time. This page always shows the latest schedule from ASPARC.</p>
    </main>
  );
}
