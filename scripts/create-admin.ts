/**
 * Create a dashboard user on the configured backend (Supabase in production).
 *   npm run admin:create -- --email you@asparc.com.au --name "John Kobiela" --role owner
 * The password is prompted for (never passed on the command line or stored in history).
 */
import { createInterface } from 'node:readline/promises';
import { createAdminUser } from '../lib/auth/login';
import { validatePasswordStrength } from '../lib/auth/password';

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

async function main() {
  const email = arg('email');
  const role = (arg('role') ?? 'owner') as 'owner' | 'manager' | 'staff';
  if (!email || !['owner', 'manager', 'staff'].includes(role)) {
    console.error('Usage: npm run admin:create -- --email you@example.com [--name "Full Name"] [--role owner|manager|staff]');
    process.exit(1);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const password = process.env.ADMIN_PASSWORD ?? (await rl.question('Password (12+ chars, upper/lower/number): '));
  rl.close();
  const weak = validatePasswordStrength(password);
  if (weak) throw new Error(weak);
  const u = await createAdminUser({ email, password, fullName: arg('name'), role });
  console.log(`✔ Created ${u.role} ${u.email} (${u.id})`);
}
main().catch((e) => {
  console.error('✖', e instanceof Error ? e.message : e);
  process.exit(1);
});
