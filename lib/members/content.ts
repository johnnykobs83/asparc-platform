import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readCookie, SESSION_COOKIE, verifySession, type Session } from '../auth/session';
import type { Member } from '../db/types';
import { escapeHtml as esc } from '../integrations/resend';
import { MEMBER_PAGES, type AccessKey, type MemberPageSlug } from './catalog';
import { memberFromCookie } from './service';
import { MEMBER_COOKIE } from './session';

/**
 * Serves the Members-area files from /members-content (never /public, so
 * nothing is reachable without signing in). next.config.mjs adds the folder
 * to the serverless bundle for the /members routes.
 */
export const CONTENT_DIR = path.join(process.cwd(), 'members-content');

/** Who is asking: a signed-in member, or a staff member previewing from the dashboard. */
export async function viewer(req: Request): Promise<{ member: Member | null; staff: Session | null }> {
  const member = await memberFromCookie(readCookie(req, MEMBER_COOKIE));
  if (member) return { member, staff: null };
  const staff = await verifySession(readCookie(req, SESSION_COOKIE)).catch(() => null);
  return { member: null, staff };
}

export const hasAccess = (v: { member: Member | null; staff: Session | null }, key: AccessKey) => Boolean(v.staff || (v.member && v.member[key]));

const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
};

export function loginRedirect(req: Request): Response {
  const url = new URL(req.url);
  const to = new URL('/members/login', url);
  to.searchParams.set('next', url.pathname);
  return new Response(null, { status: 307, headers: { Location: to.pathname + to.search, 'Cache-Control': 'no-store' } });
}

/** A small branded page for "no access" / "not found". */
export function messagePage(title: string, text: string, status: number): Response {
  const html = `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · ASPARC Members</title>
<style>body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#F2F5F8;color:#101820;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}main{max-width:460px;background:#fff;border-radius:14px;padding:32px;text-align:center;box-shadow:0 10px 30px -15px rgba(16,24,32,.3)}img{height:84px;width:auto}h1{font-size:22px;margin:18px 0 8px;color:#14519C;text-transform:uppercase}p{line-height:1.5;color:#4b5563}a{display:inline-block;margin-top:14px;background:#14519C;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600}</style></head>
<body><main><img src="/brand/asparc-logo.jpg" alt="ASPARC"><h1>${esc(title)}</h1><p>${esc(text)}</p><a href="/members">Back to Members</a></main></body></html>`;
  return new Response(html, { status, headers: PAGE_HEADERS });
}

/** The member bar placed above each resource page. Self-contained CSS (prefixed) so it can't clash with the page. */
function memberBar(who: string, preview: boolean): string {
  return `<style>.asm-bar{position:relative;z-index:1000;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:8px 16px;background:#fff;border-bottom:3px solid #14519C;font:500 14px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;color:#101820}
.asm-bar a,.asm-bar button{color:#14519C;text-decoration:none;font:600 14px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif}
.asm-bar img{height:40px;width:auto;display:block}.asm-l{display:flex;align-items:center;gap:14px}.asm-r{display:flex;align-items:center;gap:14px}
.asm-bar form{margin:0}.asm-bar button{background:none;border:1px solid #d5dde6;border-radius:6px;padding:6px 12px;cursor:pointer}
.asm-who{color:#5b6670}.asm-pv{background:#fff4e0;color:#8a5a00;border-radius:999px;padding:2px 10px;font-size:12px}
@media (prefers-color-scheme:dark){.asm-bar{background:#fff}}</style>
<div class="asm-bar"><div class="asm-l"><a href="/members" aria-label="ASPARC Members home"><img src="/brand/asparc-logo.jpg" alt="ASPARC"></a><a href="/members">← Members home</a></div>
<div class="asm-r">${preview ? '<span class="asm-pv">Staff preview</span>' : ''}<span class="asm-who">${esc(who)}</span>${
    preview ? '' : '<form method="post" action="/api/members/logout"><button type="submit">Sign out</button></form>'
  }</div></div>`;
}

/** Serves one resource page wrapped as a full document with the member bar. */
export async function servePage(req: Request, slug: MemberPageSlug): Promise<Response> {
  const page = MEMBER_PAGES.find((p) => p.slug === slug)!;
  const v = await viewer(req);
  if (!v.member && !v.staff) return loginRedirect(req);
  if (!hasAccess(v, page.access)) {
    return messagePage('No access to this page', `Your account doesn't include ${page.title}. Contact ASPARC if you need it.`, 403);
  }
  const raw = await readFile(path.join(CONTENT_DIR, page.file), 'utf8');
  // The files are page fragments: title, font links and styles first, then the body.
  const cut = raw.indexOf('</style>');
  const head = cut > 0 ? raw.slice(0, cut + 8) : '';
  const body = cut > 0 ? raw.slice(cut + 8) : raw;
  const who = v.member ? v.member.full_name : v.staff!.name ?? v.staff!.email;
  const html = `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><link rel="icon" href="/icon.png">${head}</head><body>${memberBar(who, !v.member)}${body}</body></html>`;
  return new Response(html, { status: 200, headers: PAGE_HEADERS });
}

export async function readDownload(file: string): Promise<Buffer> {
  return readFile(path.join(CONTENT_DIR, 'downloads', path.basename(file)));
}
