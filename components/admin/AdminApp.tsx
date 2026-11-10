'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api, useApi } from './api';
import { SECTIONS, type SectionKey } from './sections-config';

export { SECTIONS, type SectionKey };
import { ErrorNote, Loading, cx } from './ui';
import { Logo } from '../site/Logo';
import { Overview } from './sections/Overview';
import { AcademySection, BookingsSection, ConversationsSection, LeadsSection } from './sections/Pipeline';
import { KnowledgeSection, PricingSection } from './sections/Content';
import { IntegrationsSection, NotificationsSection, ReportsSection, RevenueSection, SettingsSection } from './sections/System';

export interface Me {
  user: { id: string; email: string; role: 'owner' | 'manager' | 'staff'; name: string | null };
  permissions: string[];
}


export function AdminApp({ section }: { section: string }) {
  const me = useApi<Me>('/api/auth/me');
  const unread = useApi<{ unread: number }>('/api/admin/notifications?unread=1');
  const [navOpen, setNavOpen] = useState(false);

  if (me.loading && !me.data) return <div className="min-h-screen bg-mist p-10"><Loading /></div>;
  if (me.error || !me.data) return <div className="min-h-screen bg-mist p-10"><ErrorNote message={me.error ?? 'Not signed in'} /></div>;

  const current = SECTIONS.find((s) => s.key === section);
  const can = (p: string) => me.data!.permissions.includes(p);

  const body = (() => {
    switch (section as SectionKey) {
      case 'overview': return <Overview />;
      case 'conversations': return <ConversationsSection can={can} />;
      case 'leads': return <LeadsSection can={can} />;
      case 'bookings': return <BookingsSection can={can} />;
      case 'academy': return <AcademySection can={can} />;
      case 'revenue': return can('revenue:view') ? <RevenueSection /> : <NoAccess />;
      case 'knowledge-base': return <KnowledgeSection can={can} />;
      case 'pricing': return <PricingSection can={can} />;
      case 'notifications': return <NotificationsSection can={can} onChange={unread.reload} />;
      case 'integrations': return can('integrations:view') ? <IntegrationsSection can={can} /> : <NoAccess />;
      case 'reports': return <ReportsSection can={can} />;
      case 'settings': return <SettingsSection me={me.data!} can={can} />;
      default: return <ErrorNote message="Section not found" />;
    }
  })();

  return (
    <div className="min-h-screen bg-mist font-sans text-charcoal">
      {/* Sidebar */}
      <aside className={cx('fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-charcoal text-white transition-transform lg:translate-x-0', navOpen ? 'translate-x-0' : '-translate-x-full')}>
        <div className="speed-lines absolute inset-0 opacity-50" aria-hidden="true" />
        <a href="/admin" className="relative flex items-center gap-3 bg-white px-5 py-3" aria-label="ASPARC dashboard home">
          <Logo className="h-12" />
          <span className="rounded bg-royal px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">Admin</span>
        </a>
        <nav aria-label="Dashboard" className="relative flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-0.5">
            {SECTIONS.map((s) => {
              const active = s.key === section;
              return (
                <li key={s.key}>
                  <a
                    href={s.key === 'overview' ? '/admin' : `/admin/${s.key}`}
                    aria-current={active ? 'page' : undefined}
                    className={cx('flex items-center gap-3 rounded-md px-3 py-2 text-sm transition', active ? 'bg-royal text-white' : 'text-white/70 hover:bg-white/5 hover:text-white')}
                  >
                    <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d={s.icon} />
                    </svg>
                    <span className="flex-1">{s.label}</span>
                    {s.key === 'notifications' && (unread.data?.unread ?? 0) > 0 && (
                      <span className="rounded-full bg-sky px-1.5 text-[11px] font-bold text-charcoal">{unread.data!.unread}</span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="relative border-t border-white/10 p-4 text-xs text-white/60">
          <p className="truncate text-white/90">{me.data.user.name ?? me.data.user.email}</p>
          <p className="mt-0.5 uppercase tracking-wider">{me.data.user.role}</p>
        </div>
      </aside>
      {navOpen && <button type="button" aria-label="Close menu" className="fixed inset-0 z-30 bg-charcoal/40 lg:hidden" onClick={() => setNavOpen(false)} />}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-line bg-white/95 px-4 backdrop-blur sm:px-8">
          <div className="flex items-center gap-3">
            <button type="button" className="rounded p-2 text-charcoal lg:hidden" aria-label="Open menu" onClick={() => setNavOpen(true)}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            </button>
            <p className="text-sm text-muted">
              <span className="hidden sm:inline">ASPARC Management · </span>
              <span className="font-medium text-charcoal">{current?.label ?? 'Dashboard'}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/" target="_blank" rel="noopener" className="hidden rounded-md px-3 py-1.5 text-sm text-muted hover:bg-mist hover:text-charcoal sm:inline-block">View website ↗</a>
            <a href="/admin/notifications" className="relative rounded-md p-2 text-muted hover:bg-mist hover:text-charcoal" aria-label={`Notifications (${unread.data?.unread ?? 0} unread)`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={SECTIONS[8].icon} /></svg>
              {(unread.data?.unread ?? 0) > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-danger" />}
            </a>
            <button
              type="button"
              className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-royal hover:text-royal"
              onClick={async () => {
                await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
                window.location.href = '/admin/login';
              }}
            >
              Sign out
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8">{body}</main>
      </div>
    </div>
  );
}

function NoAccess() {
  return <ErrorNote message="Your role does not have access to this section." />;
}

export function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [next, setNext] = useState('/admin');
  useEffect(() => {
    const n = new URLSearchParams(window.location.search).get('next');
    if (n && n.startsWith('/admin') && !n.startsWith('//')) setNext(n);
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/login', { body: { email: fd.get('email'), password: fd.get('password') } });
      window.location.href = next;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
      setBusy(false);
    }
  }
  return (
    <main className="speed-lines flex min-h-screen items-center justify-center bg-charcoal px-4">
      <div className="w-full max-w-sm">
        <form onSubmit={submit} className="space-y-4 rounded-2xl bg-white p-7 shadow-2xl">
          <div className="flex flex-col items-center border-b border-line pb-5">
            <Logo className="h-36" />
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-royal">Management dashboard</p>
          </div>
          <div>
            <label htmlFor="email" className="field-label">Email</label>
            <input id="email" name="email" type="email" autoComplete="username" required className="field" />
          </div>
          <div>
            <label htmlFor="password" className="field-label">Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required className="field" />
          </div>
          {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <p className="text-center text-xs text-muted">Authorised ASPARC staff only. Access is logged.</p>
        </form>
      </div>
    </main>
  );
}
