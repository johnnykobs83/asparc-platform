import { z } from 'zod';
import { createAdminUser } from '@/lib/auth/login';
import { validatePasswordStrength } from '@/lib/auth/password';
import { db } from '@/lib/db';
import { error, handler, json, readJson, requireAdmin } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req) => {
  await requireAdmin(req, 'users:manage');
  const users = (await db().list('admin_users')).map(({ password_hash: _p, ...u }) => u);
  return json({ users });
});

export const POST = handler(async (req) => {
  await requireAdmin(req, 'users:manage');
  const b = z.object({ email: z.string().email(), password: z.string().min(1).max(200), full_name: z.string().max(120).optional(), role: z.enum(['owner', 'manager', 'staff']) }).parse(await readJson(req));
  const weak = validatePasswordStrength(b.password);
  if (weak) return error(weak, 422, { fields: { password: weak } });
  const u = await createAdminUser({ email: b.email, password: b.password, fullName: b.full_name, role: b.role });
  const { password_hash: _p, ...safe } = u;
  return json({ user: safe }, 201);
});
