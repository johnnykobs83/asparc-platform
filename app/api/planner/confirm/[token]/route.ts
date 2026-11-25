import { db } from '@/lib/db';
import { escapeHtml } from '@/lib/integrations/resend';
import { handler } from '@/lib/http/respond';
import { readConfirmToken } from '@/lib/planner/notify';
import { acknowledge } from '@/lib/planner/service';
import { dayLabel } from '@/lib/planner/time';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string }> };

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)} – ASPARC</title>
<style>body{margin:0;background:#F2F5F8;font:16px/1.5 Arial,Helvetica,sans-serif;color:#101820;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}main{background:#fff;border-radius:12px;max-width:440px;width:100%;padding:28px;text-align:center;border-top:6px solid #14519C}h1{color:#14519C;font-size:22px;margin:0 0 10px}button{background:#14519C;color:#fff;border:0;border-radius:8px;padding:14px 22px;font-size:16px;font-weight:bold;cursor:pointer;min-width:220px}</style></head>
<body><main><img src="/brand/asparc-logo.jpg" alt="ASPARC" width="90" style="height:auto"><h1>${escapeHtml(title)}</h1>${body}</main></body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' } });
}

/** Link from the staff email. Shows a button, so link scanners in mail apps can't confirm on someone's behalf. */
export const GET = handler(async (_req, { params }: Ctx) => {
  const t = readConfirmToken((await params).token);
  if (!t) return page('This link has expired', '<p>Open your latest ASPARC email, or ask your manager to resend your week.</p>', 410);
  const staff = await db().get('staff_members', t.staffId);
  if (!staff) return page('This link has expired', '<p>Ask your manager to resend your week.</p>', 410);
  return page(`Your week from ${dayLabel(t.weekStart)}`, `<p>Hi ${escapeHtml(staff.full_name.split(' ')[0])}, tap below to let us know you've seen where you're working.</p><form method="post"><button type="submit">Got it – confirm my week</button></form>`);
});

export const POST = handler(async (_req, { params }: Ctx) => {
  const t = readConfirmToken((await params).token);
  if (!t) return page('This link has expired', '<p>Open your latest ASPARC email, or ask your manager to resend your week.</p>', 410);
  const n = await acknowledge(t.staffId, { weekStart: t.weekStart });
  return page('Thanks – you’re confirmed', `<p>${n ? `${n} job${n === 1 ? '' : 's'} confirmed for the week from ${escapeHtml(dayLabel(t.weekStart))}.` : 'You have no jobs that week any more.'}</p>`);
});
