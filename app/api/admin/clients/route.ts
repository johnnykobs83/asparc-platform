import { createClient, listClients } from '@/lib/clients/service';
import { handler, json, readJson, requireAdmin } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';

/** The client database. ?q= searches name, email and mobile (used by the booking form's client picker). */
export const GET = handler(async (req) => {
  await requireAdmin(req, 'clients:view');
  const url = new URL(req.url);
  const q = url.searchParams.get('q');
  const limit = Number(url.searchParams.get('limit')) || undefined;
  return json({ clients: await listClients({ q, limit: limit ? Math.min(limit, 50) : undefined }) });
});

/** Staff add a client by hand (e.g. before their first booking). */
export const POST = handler(async (req) => {
  await requireAdmin(req, 'clients:write');
  return json({ client: await createClient(await readJson(req, 8_000)) }, 201);
});
