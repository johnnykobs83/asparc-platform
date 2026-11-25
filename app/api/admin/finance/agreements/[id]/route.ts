import { AgreementPatch, updateAgreement } from '@/lib/finance/service';
import { handler, json, readJson, requireHidden } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';

export const PATCH = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await requireHidden(req, 'finance:manage');
  return json({ agreement: await updateAgreement((await params).id, AgreementPatch.parse(await readJson(req))) });
});
