import { createClient, ClientInput, financeOverview } from '@/lib/finance/service';
import { handler, json, readJson, requireHidden } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';

/** OWNER ONLY. Everyone else gets 404. */
export const GET = handler(async (req) => {
  await requireHidden(req, 'finance:manage');
  try {
    return json({ ready: true, ...(await financeOverview()) });
  } catch (e) {
    console.error('[finance]', e);
    return json({ ready: false });
  }
});

export const POST = handler(async (req) => {
  await requireHidden(req, 'finance:manage');
  return json({ client: await createClient(ClientInput.parse(await readJson(req))) }, 201);
});
