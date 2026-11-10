import { permissionsFor } from '@/lib/auth/rbac';
import { handler, json, requireAdmin } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';
export const GET = handler(async (req) => {
  const s = await requireAdmin(req);
  return json({ user: { id: s.sub, email: s.email, role: s.role, name: s.name }, permissions: permissionsFor(s.role) });
});
