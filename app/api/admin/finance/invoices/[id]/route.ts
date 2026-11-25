import { InvoicePatch, updateInvoice } from '@/lib/finance/service';
import { handler, json, readJson, requireHidden } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';

/** Record a payment, void, or correct an invoice. */
export const PATCH = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await requireHidden(req, 'finance:manage');
  return json({ invoice: await updateInvoice((await params).id, InvoicePatch.parse(await readJson(req))) });
});
