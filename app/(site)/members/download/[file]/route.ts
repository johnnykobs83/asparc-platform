import { findDownload } from '@/lib/members/catalog';
import { hasAccess, loginRedirect, messagePage, readDownload, viewer } from '@/lib/members/content';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Posters and social images, for members with download access (and staff). Only whitelisted names are served. */
export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const d = findDownload(decodeURIComponent((await params).file));
  if (!d) return messagePage('File not found', 'That download does not exist.', 404);
  const v = await viewer(req);
  if (!v.member && !v.staff) return loginRedirect(req);
  if (!hasAccess(v, 'access_downloads')) return messagePage('No access to downloads', "Your account doesn't include the poster downloads. Contact ASPARC if you need them.", 403);
  const bytes = await readDownload(d.file);
  const inline = new URL(req.url).searchParams.get('view') === '1';
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': d.type,
      'Content-Length': String(bytes.length),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${d.file}"`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
