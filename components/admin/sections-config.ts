/**
 * Admin section list. Kept in a plain (non-'use client') module so server
 * components such as app/admin/[section]/page.tsx can read it as data.
 */
export const SECTIONS = [
  { key: 'overview', label: 'Overview', icon: 'M4 13h6V4H4v9zm0 7h6v-5H4v5zm10 0h6v-9h-6v9zm0-16v5h6V4h-6z' },
  { key: 'conversations', label: 'Conversations', icon: 'M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z' },
  { key: 'leads', label: 'Leads', icon: 'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0' },
  { key: 'bookings', label: 'Bookings', icon: 'M7 3v3m10-3v3M4 9h16M5 6h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1z' },
  { key: 'academy', label: 'Academy Registrations', icon: 'M12 3l9 5-9 5-9-5 9-5zm-6 8v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5' },
  { key: 'revenue', label: 'Revenue', icon: 'M12 3v18m4-14H10a3 3 0 000 6h4a3 3 0 010 6H7' },
  { key: 'knowledge-base', label: 'AI Knowledge Base', icon: 'M5 4h11l3 3v13H5V4zm4 6h6m-6 4h6' },
  { key: 'pricing', label: 'Pricing & Services', icon: 'M3 12l9-9 9 9-9 9-9-9zm9-3v6' },
  { key: 'notifications', label: 'Notifications', icon: 'M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0' },
  { key: 'integrations', label: 'Integrations', icon: 'M8 7h8M8 17h8M4 12h16M6 4v16M18 4v16' },
  { key: 'reports', label: 'Reports', icon: 'M5 20V10m7 10V4m7 16v-7' },
  { key: 'settings', label: 'Settings', icon: 'M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.4 7.4 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 00-2-1.2L14.5 2h-5l-.4 2.6a7 7 0 00-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 000 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 002 1.2l.4 2.6h5l.4-2.6a7 7 0 002-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z' },
] as const;

export type SectionKey = (typeof SECTIONS)[number]['key'];
