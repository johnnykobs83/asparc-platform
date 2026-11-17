import { refreshPublicSiteData } from '@/lib/kb/cached';
import { z } from 'zod';
import { db } from '@/lib/db';
import { handler, json, readJson, requireAdmin } from '@/lib/http/respond';
import { listServices } from '@/lib/kb/service';
import { ServiceFields, offerProblem } from '@/lib/admin/schemas';

export const dynamic = 'force-dynamic';


export const GET = handler(async (req) => {
  await requireAdmin(req);
  return json({ services: await listServices() });
});

export const POST = handler(async (req) => {
  await requireAdmin(req, 'services:write');
  const body = z
    .object({ slug: z.string().regex(/^[a-z0-9-]{2,60}$/), ...ServiceFields })
    .partial({ duration_minutes: true, price_cents: true, price_unit: true, payment_link_url: true, sort_order: true, bookable: true, is_public: true, standard_price_cents: true, offer_label: true, offer_terms: true, is_featured: true })
    .refine((v) => v.price_status === 'on_enquiry' || v.price_cents != null, { message: 'Draft or approved pricing needs a price', path: ['price_cents'] })
    .refine((v) => !offerProblem(v), (v) => ({ message: offerProblem(v) ?? '', path: ['standard_price_cents'] }))
    .parse(await readJson(req));
  if (await db().findOne('services', { slug: body.slug })) return json({ error: 'Slug already exists' }, 409);
  const service = await db().insert('services', body);
  refreshPublicSiteData();
  return json({ service }, 201);
});
