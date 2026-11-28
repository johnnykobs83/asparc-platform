import type { Metadata } from 'next';
import Link from 'next/link';
import { SetPasswordForm } from '@/components/members/MemberForms';
import { Section } from '@/components/site/ui';
import { checkLink } from '@/lib/members/service';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Set your password',
  description: 'Set your ASPARC Members password.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

/** Opened from the one-time link in the invite or reset email. */
export default async function SetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const check = await checkLink(token).catch(() => ({ ok: false as const }));
  return (
    <Section tone="mist" className="!py-12 sm:!py-20">
      <div className="mx-auto mb-8 max-w-md text-center">
        <p className="eyebrow mb-3 text-royal">ASPARC Members</p>
        {check.ok ? (
          <>
            <h1 className="text-balance text-4xl uppercase leading-[0.95] sm:text-5xl">{check.kind === 'invite' ? 'Welcome' : 'New password'}</h1>
            <p className="mt-4 text-muted">
              {check.kind === 'invite'
                ? `Hi ${check.member.full_name.split(/\s+/)[0]}, choose a password for ${check.member.email}. You'll use it to sign in to the Members area.`
                : `Choose a new password for ${check.member.email}.`}
            </p>
          </>
        ) : (
          <>
            <h1 className="text-balance text-4xl uppercase leading-[0.95] sm:text-5xl">Link expired</h1>
            <p className="mt-4 text-muted">This link has expired or has already been used. Each link works once.</p>
            <p className="mt-6"><Link href="/members/login" className="btn-primary">Go to member login</Link></p>
            <p className="mt-4 text-sm text-muted">Already set your password? Sign in. Otherwise use &quot;Forgot your password?&quot; on the login page, or ask ASPARC for a new invite.</p>
          </>
        )}
      </div>
      {check.ok && <SetPasswordForm token={token} kind={check.kind} />}
    </Section>
  );
}
