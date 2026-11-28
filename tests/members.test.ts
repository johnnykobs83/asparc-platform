import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { GET as membersGET, POST as membersPOST } from '../app/api/admin/members/route';
import { DELETE as memberDELETE, PATCH as memberPATCH } from '../app/api/admin/members/[id]/route';
import { POST as linkPOST } from '../app/api/admin/members/[id]/link/route';
import { POST as loginPOST } from '../app/api/members/login/route';
import { POST as logoutPOST } from '../app/api/members/logout/route';
import { POST as setPwPOST } from '../app/api/members/set-password/route';
import { POST as forgotPOST } from '../app/api/members/forgot/route';
import { GET as hubGET } from '../app/(site)/members/training-health/route';
import { GET as warmupGET } from '../app/(site)/members/warm-up/route';
import { GET as downloadGET } from '../app/(site)/members/download/[file]/route';
import { GET as meGET } from '../app/api/auth/me/route';
import { middleware } from '../middleware';
import { db } from '../lib/db';
import { memberFromCookie } from '../lib/members/service';
import { DOWNLOADS } from '../lib/members/catalog';
import { adminCookie, ctx, freshDb, mockFetch, req } from './helpers';

const RESEND = { RESEND_API_KEY: 're_test_key', RESEND_FROM: 'ASPARC <members@asparc.com.au>' };
const PW = 'Kick-off-Ready-2027';
const person = (over: Record<string, unknown> = {}) => ({ full_name: 'Sam Player', email: 'Sam@Example.com', club: 'Whittlesea Ranges FC', team: 'U18 NPL', ...over });
const fileCtx = (file: string) => ({ params: Promise.resolve({ file }) });
const tokenOf = (link: string) => link.split('/members/set-password/')[1];
const cookieOf = (res: Response) => (res.headers.get('set-cookie') ?? '').split(';')[0];

async function addMember(over: Record<string, unknown> = {}) {
  const res = await membersPOST(req('/api/admin/members', { body: { ...person(over), send_email: false }, cookie: await adminCookie('owner') }));
  assert.equal(res.status, 201);
  return (await res.json()) as { member: { id: string; email: string; state: string }; link: string; email: string };
}

async function activate(over: Record<string, unknown> = {}) {
  const added = await addMember(over);
  const res = await setPwPOST(req('/api/members/set-password', { body: { token: tokenOf(added.link), password: PW } }));
  assert.equal(res.status, 200);
  return { id: added.member.id, cookie: cookieOf(res), link: added.link };
}

describe('members: staff invite people from the dashboard', () => {
  beforeEach(() => freshDb());

  it('an owner adds a member and gets a one-time link; the email is stored lower-case', async () => {
    const r = await addMember();
    assert.equal(r.member.email, 'sam@example.com');
    assert.equal(r.member.state, 'invited');
    assert.match(r.link, /^https:\/\/www\.asparc\.com\.au\/members\/set-password\/[\w-]+\.[\w-]+$/);
    assert.equal(r.email, 'not_requested');
    const row = (await db().list('members'))[0];
    assert.ok(row.invite_nonce && row.invite_expires_at && !row.password_hash);
    const listed = (await (await membersGET(req('/api/admin/members', { cookie: await adminCookie('staff') }))).json()) as { ready: boolean; members: Record<string, unknown>[] };
    assert.equal(listed.ready, true);
    assert.equal(listed.members.length, 1);
    assert.ok(!('password_hash' in listed.members[0]) && !('invite_nonce' in listed.members[0]), 'secrets never leave the server');
  });

  it('staff can see members but only owners and managers can add or change them', async () => {
    const staff = await adminCookie('staff');
    assert.equal((await membersPOST(req('/api/admin/members', { body: person(), cookie: staff }))).status, 403);
    const { member } = await addMember();
    assert.equal((await memberPATCH(req(`/api/admin/members/${member.id}`, { method: 'PATCH', body: { active: false }, cookie: staff }), ctx(member.id))).status, 403);
    assert.equal((await membersPOST(req('/api/admin/members', { body: { ...person({ email: 'm@x.com' }), send_email: false }, cookie: await adminCookie('manager') }))).status, 201);
    assert.equal((await memberDELETE(req(`/api/admin/members/${member.id}`, { method: 'DELETE', cookie: await adminCookie('manager') }), ctx(member.id))).status, 403);
    assert.equal((await memberDELETE(req(`/api/admin/members/${member.id}`, { method: 'DELETE', cookie: await adminCookie('owner') }), ctx(member.id))).status, 200);
  });

  it('rejects a duplicate email and a guardian account with no player name', async () => {
    await addMember();
    const dup = await membersPOST(req('/api/admin/members', { body: person({ email: 'SAM@example.com' }), cookie: await adminCookie() }));
    assert.equal(dup.status, 409);
    const g = await membersPOST(req('/api/admin/members', { body: person({ email: 'parent@x.com', is_guardian: true }), cookie: await adminCookie() }));
    assert.equal(g.status, 422);
    assert.ok(((await g.json()) as { fields: Record<string, string> }).fields.athlete_name);
  });

  it('emails the invite through Resend when email is set up', async () => {
    freshDb(RESEND);
    const calls = mockFetch([[/POST https:\/\/api\.resend\.com\/emails/, () => ({ body: { id: 'em_1' } })]]);
    const res = await membersPOST(req('/api/admin/members', { body: person({ is_guardian: true, athlete_name: 'Jordan Player' }), cookie: await adminCookie() }));
    const body = (await res.json()) as { email: string; link: string };
    assert.equal(body.email, 'sent');
    const sent = calls[0].body as { to: string[]; html: string; text: string };
    assert.deepEqual(sent.to, ['sam@example.com']);
    assert.ok(sent.html.includes(body.link) && sent.html.includes('for Jordan Player'));
  });
});

describe('members: set a password from the link and sign in', () => {
  beforeEach(() => freshDb());

  it('a weak password is refused; a good one signs them in; the link then stops working', async () => {
    const { link } = await addMember();
    const weak = await setPwPOST(req('/api/members/set-password', { body: { token: tokenOf(link), password: 'short' } }));
    assert.equal(weak.status, 422);
    const ok = await setPwPOST(req('/api/members/set-password', { body: { token: tokenOf(link), password: PW } }));
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get('set-cookie') ?? '', /^asparc_member=.+HttpOnly/);
    const again = await setPwPOST(req('/api/members/set-password', { body: { token: tokenOf(link), password: PW } }));
    assert.equal(again.status, 410);
  });

  it('a tampered or older link does not work', async () => {
    const { member, link } = await addMember();
    const t = tokenOf(link);
    assert.equal((await setPwPOST(req('/api/members/set-password', { body: { token: t.slice(0, -2) + 'xx', password: PW } }))).status, 410);
    await linkPOST(req(`/api/admin/members/${member.id}/link`, { body: { send_email: false }, cookie: await adminCookie() }), ctx(member.id));
    assert.equal((await setPwPOST(req('/api/members/set-password', { body: { token: t, password: PW } }))).status, 410, 'a new link cancels the old one');
  });

  it('login works with the right password only, and counts sign-ins', async () => {
    const { id } = await activate();
    assert.equal((await loginPOST(req('/api/members/login', { body: { email: 'sam@example.com', password: 'Wrong-password-1' } }))).status, 401);
    assert.equal((await loginPOST(req('/api/members/login', { body: { email: 'nobody@example.com', password: PW } }))).status, 401);
    const ok = await loginPOST(req('/api/members/login', { body: { email: 'SAM@example.com', password: PW } }));
    assert.equal(ok.status, 200);
    assert.ok(await memberFromCookie(cookieOf(ok).split('=')[1]));
    assert.equal((await db().get('members', id))!.login_count, 2);
  });

  it('logout clears the cookie and goes back to the login page', async () => {
    const res = await logoutPOST(req('/api/members/logout', { method: 'POST' }));
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), '/members/login?signed_out=1');
    assert.match(res.headers.get('set-cookie') ?? '', /asparc_member=;.*Max-Age=0/);
  });
});

describe('members: pages and downloads need a sign-in and the right access', () => {
  beforeEach(() => freshDb());

  it('signed out: pages and downloads send you to the login page', async () => {
    const r = await hubGET(req('/members/training-health'));
    assert.equal(r.status, 307);
    assert.equal(r.headers.get('location'), '/members/login?next=%2Fmembers%2Ftraining-health');
    assert.equal((await downloadGET(req('/members/download/x'), fileCtx(DOWNLOADS[1].file))).status, 307);
  });

  it('a member sees the hub with their name in the bar, and can download posters', async () => {
    const { cookie } = await activate();
    const r = await hubGET(req('/members/training-health', { cookie }));
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.ok(html.startsWith('<!doctype html>') && html.includes('Sam Player') && html.includes('Training &amp; Health Hub'));
    assert.ok(html.includes('href="/members/warm-up"') && !html.includes('claude.ai'), 'the hub links to the members warm-up');
    assert.equal(r.headers.get('cache-control'), 'private, no-store');
    const d = await downloadGET(req('/members/download/x', { cookie }), fileCtx(DOWNLOADS[1].file));
    assert.equal(d.status, 200);
    assert.equal(d.headers.get('content-type'), 'application/pdf');
    assert.match(d.headers.get('content-disposition') ?? '', /^attachment; filename="ASPARC-01-warm-up-A3\.pdf"$/);
    assert.equal(Buffer.from(await d.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
  });

  it('every listed download exists on disk', async () => {
    const { cookie } = await activate();
    for (const f of DOWNLOADS) assert.equal((await downloadGET(req('/members/download/x', { cookie }), fileCtx(f.file))).status, 200, f.file);
  });

  it('only whitelisted file names are served', async () => {
    const { cookie } = await activate();
    for (const name of ['../../.env.local', '..%2F..%2Fpackage.json', 'training-health.html', 'nope.pdf']) {
      assert.equal((await downloadGET(req('/members/download/x', { cookie }), fileCtx(name))).status, 404, name);
    }
  });

  it('access is per member: no warm-up access means no warm-up', async () => {
    const { cookie } = await activate({ access_warmup: false, access_downloads: false });
    assert.equal((await warmupGET(req('/members/warm-up', { cookie }))).status, 403);
    assert.equal((await hubGET(req('/members/training-health', { cookie }))).status, 200);
    assert.equal((await downloadGET(req('/members/download/x', { cookie }), fileCtx(DOWNLOADS[0].file))).status, 403);
  });

  it('staff can preview pages and downloads from the dashboard', async () => {
    const staff = await adminCookie('staff');
    const r = await warmupGET(req('/members/warm-up', { cookie: staff }));
    assert.equal(r.status, 200);
    assert.ok((await r.text()).includes('Staff preview'));
    assert.equal((await downloadGET(req('/members/download/x', { cookie: staff }), fileCtx(DOWNLOADS[0].file))).status, 200);
  });
});

describe('members: switching off, resets and separation from staff', () => {
  beforeEach(() => freshDb());

  it('switching a member off ends access straight away and blocks login', async () => {
    const { id, cookie } = await activate();
    const p = await memberPATCH(req(`/api/admin/members/${id}`, { method: 'PATCH', body: { active: false }, cookie: await adminCookie() }), ctx(id));
    assert.equal(((await p.json()) as { member: { state: string } }).member.state, 'switched_off');
    assert.equal((await hubGET(req('/members/training-health', { cookie }))).status, 307);
    const login = await loginPOST(req('/api/members/login', { body: { email: 'sam@example.com', password: PW } }));
    assert.equal(login.status, 401);
    assert.match(((await login.json()) as { error: string }).error, /switched off/);
    assert.equal((await linkPOST(req(`/api/admin/members/${id}/link`, { body: { send_email: false }, cookie: await adminCookie() }), ctx(id))).status, 422);
  });

  it('a password reset link signs out every older session once used', async () => {
    const { id, cookie } = await activate();
    const r = (await (await linkPOST(req(`/api/admin/members/${id}/link`, { body: { send_email: false }, cookie: await adminCookie() }), ctx(id))).json()) as { kind: string; link: string };
    assert.equal(r.kind, 'reset');
    await new Promise((res) => setTimeout(res, 5));
    const set = await setPwPOST(req('/api/members/set-password', { body: { token: tokenOf(r.link), password: 'A-brand-New-Pass-99' } }));
    assert.equal(set.status, 200);
    assert.equal((await hubGET(req('/members/training-health', { cookie }))).status, 307, 'old session no longer valid');
    assert.equal((await hubGET(req('/members/training-health', { cookie: cookieOf(set) }))).status, 200);
  });

  it('"forgot password" gives the same answer for any email and only emails real, active members', async () => {
    freshDb(RESEND);
    const calls = mockFetch([[/POST https:\/\/api\.resend\.com\/emails/, () => ({ body: { id: 'em' } })]]);
    await activate();
    const before = calls.length;
    const a = await forgotPOST(req('/api/members/forgot', { body: { email: 'sam@example.com' } }));
    const b = await forgotPOST(req('/api/members/forgot', { body: { email: 'stranger@example.com' } }));
    assert.equal(a.status, 200);
    assert.deepEqual(await a.json(), await b.json());
    assert.equal(calls.length - before, 1);
    assert.match((calls.at(-1)!.body as { subject: string }).subject, /Reset/);
  });

  it('a member cookie never opens the staff dashboard', async () => {
    const { cookie } = await activate();
    assert.equal((await meGET(req('/api/auth/me', { cookie }))).status, 401);
    assert.equal((await membersGET(req('/api/admin/members', { cookie }))).status, 401);
    const mw = await middleware(req('/admin', { cookie }));
    assert.equal(mw?.status, 307);
  });

  it('a staff cookie is not a member session', async () => {
    assert.equal(await memberFromCookie((await adminCookie('owner')).split('=')[1]), null);
  });
});
