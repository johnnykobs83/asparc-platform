import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { MemberLogin } from '@/components/members/MemberForms';
import { Section } from '@/components/site/ui';
import { memberFromCookie } from '@/lib/members/service';
import { MEMBER_COOKIE } from '@/lib/members/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Member login',
  description: 'Sign in to the ASPARC Members area.',
  robots: { index: false, follow: false },
};

export default async function MemberLoginPage() {
  const member = await memberFromCookie((await cookies()).get(MEMBER_COOKIE)?.value).catch(() => null);
  if (member) redirect('/members');
  return (
    <Section tone="mist" className="!py-12 sm:!py-20">
      <div className="mx-auto mb-8 max-w-md text-center">
        <p className="eyebrow mb-3 text-royal">ASPARC Members</p>
        <h1 className="text-balance text-4xl uppercase leading-[0.95] sm:text-5xl">Member login</h1>
        <p className="mt-4 text-muted">Training &amp; Health resources, the ASPARC Warm-Up and printable posters for the players, parents and coaches we work with.</p>
      </div>
      <MemberLogin />
    </Section>
  );
}
