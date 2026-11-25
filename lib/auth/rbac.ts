import type { Role } from '../db/types';

/**
 * Role-based access control. Mirrors the RLS policies in
 * supabase/migrations/20261109000002_rls.sql.
 *   owner   – everything
 *   manager – everything except admin user management
 *   staff   – view all + work leads, bookings, academy, conversations, notifications
 *
 * Staff planner: everyone can see the week and their own jobs; owners and managers plan it.
 * Club billing (clubs, agreements, invoices, what each club spends): the OWNER only.
 * Client records: everyone sees contact details and history; health forms and client
 * notes need 'clients:health' (owner, manager) – or being the practitioner on that
 * client's booking, which lib/clients/service.ts checks.
 */
export const PERMISSIONS = {
  'dashboard:view': ['owner', 'manager', 'staff'],
  'leads:write': ['owner', 'manager', 'staff'],
  'bookings:write': ['owner', 'manager', 'staff'],
  'academy:write': ['owner', 'manager', 'staff'],
  'conversations:write': ['owner', 'manager', 'staff'],
  'notifications:write': ['owner', 'manager', 'staff'],
  'kb:write': ['owner', 'manager'],
  'services:write': ['owner', 'manager'],
  'reports:run': ['owner', 'manager'],
  'integrations:view': ['owner', 'manager'],
  'integrations:run': ['owner', 'manager'],
  'revenue:view': ['owner', 'manager'],
  'clients:view': ['owner', 'manager', 'staff'],
  'clients:write': ['owner', 'manager', 'staff'],
  'clients:health': ['owner', 'manager'],
  'planner:view': ['owner', 'manager', 'staff'],
  'planner:write': ['owner', 'manager'],
  'finance:manage': ['owner'],
  'users:manage': ['owner'],
  'data:delete': ['owner'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | undefined | null, permission: Permission): boolean {
  return !!role && (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export function permissionsFor(role: Role): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(role, p));
}
