'use client';

import { useEffect, useState, type FormEvent } from 'react';

async function post(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: { error?: string; message?: string; fields?: Record<string, string> } }> {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin', cache: 'no-store' });
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string; fields?: Record<string, string> };
  return { ok: res.ok, status: res.status, data };
}

const safeNext = (n: string | null) => (n && n.startsWith('/members') && !n.startsWith('//') ? n : '/members');

export function MemberLogin() {
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [next, setNext] = useState('/members');

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setNext(safeNext(q.get('next')));
    if (q.get('signed_out')) setInfo("You're signed out.");
  }, []);

  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    setInfo(null);
    const r = await post('/api/members/login', { email: fd.get('email'), password: fd.get('password') });
    if (r.ok) {
      window.location.href = next;
      return;
    }
    setError(r.data.error ?? 'Sign-in failed. Please try again.');
    setBusy(false);
  }

  async function forgot(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const r = await post('/api/members/forgot', { email: fd.get('email') });
    setBusy(false);
    if (r.ok) {
      setInfo(r.data.message ?? 'Check your email for a link.');
      setMode('login');
    } else setError(r.data.fields?.email ?? r.data.error ?? 'Something went wrong. Please try again.');
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-line bg-white p-7 shadow-sm sm:p-9">
      {info && <p role="status" className="mb-5 rounded-lg border border-sky/40 bg-sky-100/60 px-4 py-3 text-sm text-royal">{info}</p>}
      {mode === 'login' ? (
        <form onSubmit={login} className="space-y-4">
          <div>
            <label htmlFor="m-email" className="field-label">Email</label>
            <input id="m-email" name="email" type="email" autoComplete="username" required className="field" />
          </div>
          <div>
            <label htmlFor="m-password" className="field-label">Password</label>
            <input id="m-password" name="password" type="password" autoComplete="current-password" required className="field" />
          </div>
          {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <button type="button" className="w-full text-center text-sm font-medium text-royal underline-offset-2 hover:underline" onClick={() => { setMode('forgot'); setError(null); }}>
            Forgot your password?
          </button>
        </form>
      ) : (
        <form onSubmit={forgot} className="space-y-4">
          <p className="text-sm text-muted">Enter the email ASPARC invited. If it has a member account, we&apos;ll email you a link to choose a new password.</p>
          <div>
            <label htmlFor="f-email" className="field-label">Email</label>
            <input id="f-email" name="email" type="email" autoComplete="email" required className="field" />
          </div>
          {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? 'Sending…' : 'Email me a link'}</button>
          <button type="button" className="w-full text-center text-sm font-medium text-royal underline-offset-2 hover:underline" onClick={() => { setMode('login'); setError(null); }}>
            Back to sign in
          </button>
        </form>
      )}
      <p className="mt-6 border-t border-line pt-4 text-center text-xs text-muted">Members are invited by ASPARC. No account yet? Ask your coach or contact ASPARC.</p>
    </div>
  );
}

export function SetPasswordForm({ token, kind }: { token: string; kind: 'invite' | 'reset' }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get('password') ?? '');
    if (password !== String(fd.get('confirm') ?? '')) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    const r = await post('/api/members/set-password', { token, password });
    if (r.ok) {
      window.location.href = '/members';
      return;
    }
    setError(r.data.fields?.password ?? r.data.error ?? 'Something went wrong. Please try again.');
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-md space-y-4 rounded-2xl border border-line bg-white p-7 shadow-sm sm:p-9">
      <div>
        <label htmlFor="p1" className="field-label">{kind === 'invite' ? 'Choose a password' : 'New password'}</label>
        <input id="p1" name="password" type="password" autoComplete="new-password" required minLength={12} className="field" aria-describedby="p-hint" />
        <p id="p-hint" className="mt-1.5 text-xs text-muted">At least 12 characters, with upper case, lower case and a number.</p>
      </div>
      <div>
        <label htmlFor="p2" className="field-label">Type it again</label>
        <input id="p2" name="confirm" type="password" autoComplete="new-password" required className="field" />
      </div>
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
      <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : kind === 'invite' ? 'Set password and sign in' : 'Save and sign in'}</button>
    </form>
  );
}
