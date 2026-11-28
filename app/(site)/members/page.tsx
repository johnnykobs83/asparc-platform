import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Section } from '@/components/site/ui';
import { DOWNLOADS, MEMBER_PAGES, PACK_FILE, TOPICS, downloadHref } from '@/lib/members/catalog';
import { memberFromCookie } from '@/lib/members/service';
import { MEMBER_COOKIE } from '@/lib/members/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Members',
  description: 'ASPARC Members area.',
  robots: { index: false, follow: false },
};

export default async function MembersHome() {
  const member = await memberFromCookie((await cookies()).get(MEMBER_COOKIE)?.value);
  if (!member) redirect('/members/login');

  const pages = MEMBER_PAGES.filter((p) => member[p.access]);
  const first = member.full_name.split(/\s+/)[0];
  const pack = DOWNLOADS.find((d) => d.file === PACK_FILE)!;

  return (
    <>
      <Section tone="dark" className="!py-12 sm:!py-16">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow mb-3">ASPARC Members</p>
            <h1 className="text-balance text-4xl uppercase leading-[0.95] sm:text-6xl">Welcome, <span className="text-sky">{first}</span></h1>
            <p className="mt-4 max-w-xl text-lg text-white/75">
              {member.is_guardian && member.athlete_name ? `Resources for ${member.athlete_name}. ` : ''}
              Training and health guidance, the ASPARC Warm-Up and posters for your club.
            </p>
          </div>
          <form method="post" action="/api/members/logout">
            <button type="submit" className="btn-outline">Sign out</button>
          </form>
        </div>
      </Section>

      <Section tone="mist">
        {pages.length > 0 && (
          <div className="grid gap-5 md:grid-cols-2">
            {pages.map((p) => (
              <a key={p.slug} href={`/members/${p.slug}`} className="group card relative flex flex-col overflow-hidden p-7 transition hover:-translate-y-1 hover:border-royal">
                <h2 className="text-3xl uppercase leading-tight">{p.title}</h2>
                <p className="mt-3 flex-1 text-[15px] leading-relaxed text-muted">{p.blurb}</p>
                <span className="mt-6 font-display text-sm font-semibold uppercase tracking-wider text-royal">Open →</span>
              </a>
            ))}
          </div>
        )}

        {member.access_downloads && (
          <div className={pages.length ? 'mt-14' : ''}>
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="eyebrow mb-2 text-royal">Downloads</p>
                <h2 className="text-3xl uppercase leading-tight sm:text-4xl">Posters &amp; social images</h2>
                <p className="mt-2 max-w-2xl text-muted">A3 posters to print for the change rooms (they print fine on A4 too), and 1080 × 1350 images for Instagram and Facebook.</p>
              </div>
              <a href={downloadHref(pack)} className="btn-primary shrink-0">Download all posters</a>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TOPICS.map((t) => {
                const poster = DOWNLOADS.find((d) => d.topic === t.n && d.kind === 'poster')!;
                const social = DOWNLOADS.find((d) => d.topic === t.n && d.kind === 'social')!;
                return (
                  <li key={t.slug} className="rounded-xl border border-line bg-white p-5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">{String(t.n).padStart(2, '0')} · {t.group}</p>
                    <p className="mt-1 font-display text-xl font-bold uppercase">{t.title}</p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
                      <a className="text-royal hover:underline" href={downloadHref(poster)}>Poster PDF</a>
                      <a className="text-royal hover:underline" href={downloadHref(social)}>Social image</a>
                      <a className="text-muted hover:underline" href={downloadHref(poster, true)} target="_blank" rel="noopener">Preview</a>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {pages.length === 0 && !member.access_downloads && (
          <p className="rounded-xl border border-line bg-white p-6 text-muted">Your account doesn&apos;t include any resources yet. Contact ASPARC and we&apos;ll set it up.</p>
        )}

        <p className="mt-12 text-sm text-muted">
          General information only, based on Football Australia&apos;s Training + Health guidance and the Perform+ program, with nutrition content from Compeat Nutrition. For an injury or health concern, see your doctor or physiotherapist.
        </p>
      </Section>
    </>
  );
}
