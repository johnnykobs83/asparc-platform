import { listWithCustomer } from '@/lib/admin/service';
import { handler, json, requireAdmin } from '@/lib/http/respond';
import { listServices } from '@/lib/kb/service';

export const dynamic = 'force-dynamic';
export const GET = handler(async (req) => {
  await requireAdmin(req);
  const program = (await listServices()).find((s) => s.category === 'academy') ?? null;
  return json({ registrations: await listWithCustomer('academy_registrations'), program });
});
