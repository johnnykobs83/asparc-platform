import { handler } from '@/lib/http/respond';
import { buildCalendarFeed } from '@/lib/planner/notify';

export const dynamic = 'force-dynamic';

/** Personal calendar feed (subscribe once in Google/Apple/Outlook). The token is the secret; rotating it cuts off old links. */
export const GET = handler(async (_req, { params }: { params: Promise<{ token: string }> }) => {
  const token = (await params).token.replace(/\.ics$/, '');
  const ics = await buildCalendarFeed(token);
  if (!ics) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return new Response(ics, {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="asparc.ics"', 'Cache-Control': 'private, max-age=300', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' },
  });
});
