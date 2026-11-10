import { env } from '../config/env';
import { db } from '../db';
import type { AdminUser } from '../db/types';
import { fetchWithTimeout } from '../integrations/log';
import { hashPassword, verifyPassword } from './password';

export type LoginResult = { ok: true; user: AdminUser } | { ok: false; error: string };

const GENERIC = 'Incorrect email or password.';

/**
 * Production (Supabase): password verified by Supabase Auth, then the user
 * must have an active row in admin_users (role-based access).
 * Development (local): scrypt hash in the local store; the first owner can be
 * bootstrapped from ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD.
 */
export async function authenticate(emailRaw: string, password: string): Promise<LoginResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !password) return { ok: false, error: GENERIC };
  const repo = db();

  if (repo.kind === 'supabase') {
    const res = await fetchWithTimeout(`${env.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: env.supabaseAnonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return { ok: false, error: GENERIC };
    const body = (await res.json()) as { user?: { id: string } };
    const user = body.user ? await repo.get('admin_users', body.user.id) : null;
    if (!user || !user.active) return { ok: false, error: 'This account does not have dashboard access.' };
    await repo.update('admin_users', user.id, { last_login_at: new Date().toISOString() });
    return { ok: true, user };
  }

  // ---- local development backend ----
  let user = await repo.findOne('admin_users', { email });
  if (!user && (await repo.count('admin_users')) === 0 && env.adminBootstrapEmail && env.adminBootstrapPassword && !env.isProduction) {
    if (email === env.adminBootstrapEmail && password === env.adminBootstrapPassword) {
      user = await repo.insert('admin_users', {
        email,
        full_name: 'Owner',
        role: 'owner',
        active: true,
        password_hash: await hashPassword(password),
      });
    }
  }
  if (!user || !user.active || !(await verifyPassword(password, user.password_hash))) return { ok: false, error: GENERIC };
  await repo.update('admin_users', user.id, { last_login_at: new Date().toISOString() });
  return { ok: true, user };
}

/** Creates an admin user on the configured backend. */
export async function createAdminUser(input: { email: string; password: string; fullName?: string; role: AdminUser['role'] }): Promise<AdminUser> {
  const repo = db();
  const email = input.email.trim().toLowerCase();
  if (await repo.findOne('admin_users', { email })) throw new Error('An admin with that email already exists.');

  if (repo.kind === 'supabase') {
    const res = await fetchWithTimeout(`${env.supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: env.supabaseServiceKey, Authorization: `Bearer ${env.supabaseServiceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: input.password, email_confirm: true }),
    });
    const body = (await res.json()) as { id?: string; msg?: string; message?: string };
    if (!res.ok || !body.id) throw new Error(`Supabase Auth: ${body.msg ?? body.message ?? res.status}`);
    return repo.insert('admin_users', { id: body.id, email, full_name: input.fullName ?? null, role: input.role, active: true });
  }
  return repo.insert('admin_users', {
    email,
    full_name: input.fullName ?? null,
    role: input.role,
    active: true,
    password_hash: await hashPassword(input.password),
  });
}
