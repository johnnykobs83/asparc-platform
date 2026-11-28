import { servePage } from '@/lib/members/content';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  return servePage(req, 'training-health');
}
