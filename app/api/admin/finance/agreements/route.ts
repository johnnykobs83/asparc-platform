import { AgreementInput, createAgreement } from '@/lib/finance/service';
import { handler, json, readJson, requireHidden } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req) => {
  await requireHidden(req, 'finance:manage');
  return json({ agreement: await createAgreement(AgreementInput.parse(await readJson(req))) }, 201);
});
